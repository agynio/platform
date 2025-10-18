import { z } from 'zod';
import { LoggerService } from '../services/logger.service';
import { VaultService } from '../services/vault.service';
import { EnvService, type EnvItem } from '../services/env.service';
import { isExecTimeoutError, ExecTimeoutError, ExecIdleTimeoutError, isExecIdleTimeoutError } from '../utils/execTimeout';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { BaseTool } from './base.tool';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

const bashCommandSchema = z.object({
  command: z
    .string()
    .describe(
      'The bash command to execute. It will be wrapped with /bin/sh -lc by the system. Do not open extra shells.',
    ),
});

// Static config schema for ShellTool: per-node env overlay (supports Vault refs) and optional workdir
const EnvItemSchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    source: z.enum(['static', 'vault']).optional().default('static'),
  })
  .strict()
  .describe('Environment variable entry. When source=vault, value is "<MOUNT>/<PATH>/<KEY>".');
export const ShellToolStaticConfigSchema = z
  .object({
    env: z
      .array(EnvItemSchema)
      .optional()
      .describe('Environment variables (static or vault references).')
      .meta({ 'ui:field': 'ReferenceEnvField' }),
    workdir: z.string().optional().describe('Working directory to use for each exec.'),
    executionTimeoutMs: z
      .union([z.literal(0), z.number().int().min(1000).max(86_400_000)])
      .default(60 * 60 * 1000)
      .describe('Maximum wall time for the command in milliseconds. 0 disables. Range: 1000-86400000 when enabled.'),
    idleTimeoutMs: z
      .union([z.literal(0), z.number().int().min(1000).max(86_400_000)])
      .default(60 * 1000)
      .describe('Maximum idle time (no output) in milliseconds. 0 disables. Range: 1000-86400000 when enabled.'),
  })
  .strict();

export class ShellTool extends BaseTool {
  private containerProvider?: ContainerProviderEntity;
  private cfg?: z.infer<typeof ShellToolStaticConfigSchema>;
  private envService: EnvService;

  constructor(private vault: VaultService | undefined, logger: LoggerService) { super(logger); this.envService = new EnvService(vault); }

  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
  }

  private stripAnsi(input: string): string {
    return input.replace(ANSI_REGEX, '');
  }

  init(): DynamicStructuredTool {
    return tool(
      async (input, config) => {
        const { thread_id, abort_signal } = (config?.configurable || {}) as { thread_id?: string; abort_signal?: AbortSignal };
        if (!thread_id) throw new Error('thread_id is required in configurable to use shell_command tool');

        if (!this.containerProvider) {
          throw new Error('ShellTool: containerProvider not set. Connect via graph edge before use.');
        }
        const container = await this.containerProvider.provide(thread_id);
        const { command } = bashCommandSchema.parse(input);
        this.logger.info('Tool called', 'shell_command', { command });
        const envOverlay = await this.resolveEnv();
        // Timeouts: execution and idle; 0 disables each
        const timeoutMs = this.cfg?.executionTimeoutMs ?? 60 * 60 * 1000;
        const idleTimeoutMs = this.cfg?.idleTimeoutMs ?? 60 * 1000;
        let response;
        try {
          response = await container.exec(command, { env: envOverlay, workdir: this.cfg?.workdir, timeoutMs, idleTimeoutMs, killOnTimeout: true, signal: abort_signal });
        } catch (err: unknown) {
          if (isExecTimeoutError(err) || isExecIdleTimeoutError(err)) {
            // Gather any available output from the error instance
            let combined = '';
            if (err instanceof ExecTimeoutError || err instanceof ExecIdleTimeoutError) {
              combined = `${err.stdout || ''}${err.stderr || ''}`;
            } else if (err instanceof Error) {
              // Legacy path: no streams provided
              combined = '';
            }
            const cleaned = this.stripAnsi(combined);
            const tail = cleaned.length > 10000 ? cleaned.slice(-10000) : cleaned;
            if (isExecIdleTimeoutError(err)) {
              const idleMs = (err as ExecIdleTimeoutError | Error & { timeoutMs?: number })?.timeoutMs ?? idleTimeoutMs;
              throw new Error(
                `Error (idle timeout): no output for ${idleMs}ms; command was terminated. See output tail below.\n----------\n${tail}`,
              );
            } else {
              const usedMs = (err as ExecTimeoutError | Error & { timeoutMs?: number })?.timeoutMs ?? timeoutMs;
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
      },
      {
        name: 'shell_command',
        description: 'Execute a shell command and return the output. There is no TTY/stdin, so avoid commands requiring user inputs or running in watch mode. Always use single quotes in the command to avoid variable interpolation. The command is executed with /bin/sh -lc.',
        schema: bashCommandSchema,
      },
    );
  }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    const parsed = ShellToolStaticConfigSchema.safeParse(_cfg);
    if (!parsed.success) throw new Error(`Invalid Shell tool config: ${parsed.error.message}`);
    this.cfg = parsed.data;
  }

  private async resolveEnv(): Promise<Record<string, string> | undefined> {
    const items: EnvItem[] = (this.cfg?.env || []) as EnvItem[];
    if (!items.length) return undefined;
    try { const r = await this.envService.resolveEnvItems(items); return Object.keys(r).length ? r : undefined; } catch { return undefined; }
  }

  override async getContainerForThread(threadId: string) {
    if (!this.containerProvider) return undefined;
    try { return await this.containerProvider.provide(threadId); } catch { return undefined; }
  }
}
