import { FunctionTool } from '@agyn/llm';
import z from 'zod';
import { LLMContext } from '../../../llm/types';
import { LoggerService } from '../../../core/services/logger.service';
import {
  ExecIdleTimeoutError,
  ExecTimeoutError,
  isExecIdleTimeoutError,
  isExecTimeoutError,
} from '../../../utils/execTimeout';
import { ShellCommandNode, ShellToolStaticConfigSchema } from './shell_command.node';

// Schema for tool arguments
export const bashCommandSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      'Shell command to execute. Avoid interactive commands or watch mode. Use single quotes to prevent interpolation.',
    ),
});

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX = /[\u001B\u009B][[[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

export class ShellCommandTool extends FunctionTool<typeof bashCommandSchema> {
  private logger = new LoggerService();
  constructor(private node: ShellCommandNode) {
    super();
  }

  get name() {
    return 'shell_command';
  }
  get schema() {
    return bashCommandSchema;
  }
  get description() {
    return 'Execute a non-interactive shell command in the workspace container identified by thread_id and return stdout (or error tail).';
  }

  private stripAnsi(input: string): string {
    return input.replace(ANSI_REGEX, '');
  }

  async execute(args: z.infer<typeof bashCommandSchema>, ctx: LLMContext): Promise<string> {
    const { command } = args;
    const { threadId } = ctx;

    const provider = this.node.provider;
    if (!provider) throw new Error('ShellCommandTool: containerProvider not set. Connect via graph edge before use.');
    const container = await provider.provide(threadId);
    this.logger.info('Tool called', 'shell_command', { command });

    // Base env pulled from container; overlay from node config
    const baseEnv = await container.getEnv?.();
    const envOverlay = await this.node.resolveEnv(baseEnv);
    const cfg = (this.node.config || {}) as z.infer<typeof ShellToolStaticConfigSchema>;
    const timeoutMs = cfg.executionTimeoutMs ?? 60 * 60 * 1000;
    const idleTimeoutMs = cfg.idleTimeoutMs ?? 60 * 1000;

    let response: { stdout: string; stderr: string; exitCode: number };
    try {
      response = await container.exec(command, {
        env: envOverlay,
        workdir: cfg.workdir,
        timeoutMs,
        idleTimeoutMs,
        killOnTimeout: true,
      });
    } catch (err: unknown) {
      if (isExecTimeoutError(err) || isExecIdleTimeoutError(err)) {
        let combined = '';
        if (err instanceof ExecTimeoutError || err instanceof ExecIdleTimeoutError) {
          combined = `${err.stdout || ''}${err.stderr || ''}`;
        }
        const cleaned = this.stripAnsi(combined);
        const tail = cleaned.length > 10000 ? cleaned.slice(-10000) : cleaned;
        if (isExecIdleTimeoutError(err)) {
          const idleMs = (err as ExecIdleTimeoutError | (Error & { timeoutMs?: number }))?.timeoutMs ?? idleTimeoutMs;
          throw new Error(
            `Error (idle timeout): no output for ${idleMs}ms; command was terminated. See output tail below.\n----------\n${tail}`,
          );
        } else {
          const usedMs = (err as ExecTimeoutError | (Error & { timeoutMs?: number }))?.timeoutMs ?? timeoutMs;
          throw new Error(
            `Error (timeout after ${usedMs}ms): command exceeded ${usedMs}ms and was terminated. See output tail below.\n----------\n${tail}`,
          );
        }
      }
      throw err;
    }

    const cleanedStdout = this.stripAnsi(response.stdout);
    const cleanedStderr = this.stripAnsi(response.stderr);
    if (response.exitCode !== 0) {
      return `Error (exit code ${response.exitCode}):\n${cleanedStdout}\n${cleanedStderr}`;
    }

    return cleanedStdout;
  }
}
