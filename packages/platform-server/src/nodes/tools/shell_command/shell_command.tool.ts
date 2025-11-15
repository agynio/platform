import { FunctionTool } from '@agyn/llm';
import z from 'zod';
import { posix as pathPosix } from 'node:path';
import { LLMContext } from '../../../llm/types';
import { LoggerService } from '../../../core/services/logger.service';
import {
  ExecIdleTimeoutError,
  ExecTimeoutError,
  isExecIdleTimeoutError,
  isExecTimeoutError,
} from '../../../utils/execTimeout';
import { ShellCommandNode, ShellToolStaticConfigSchema } from './shell_command.node';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { ArchiveService } from '../../../infra/archive/archive.service';
import { ContainerHandle } from '../../../infra/container/container.handle';

const SAFE_CWD_PATTERN = /^[A-Za-z0-9._/-]+$/;
const DEFAULT_WORKSPACE_ROOT = '/workspace';

// Schema for tool arguments
export const bashCommandSchema = z
  .object({
    command: z
      .string()
      .min(1)
      .describe(
        `Shell command to execute. Avoid interactive commands or watch mode. Use single quotes for cli arguments to prevent unexpected interpolation (do not wrap entire command in quotes). Command is executed in wrapper \`bash -lc '<COMMAND>'\`, no need to add bash invocation.`,
      ),
    cwd: z
      .string()
      .min(1)
      .regex(SAFE_CWD_PATTERN, 'cwd may only include letters, numbers, ".", "-", "_" and "/" characters.')
      .optional()
      .describe(
        'Optional working directory for this call. Absolute paths must remain within the workspace root; relative paths resolve against the configured workdir or workspace root.',
      ),
  })
  .strict();

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX = /[\u001B\u009B][[[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

@Injectable({ scope: Scope.TRANSIENT })
export class ShellCommandTool extends FunctionTool<typeof bashCommandSchema> {
  private logger = new LoggerService();
  private _node?: ShellCommandNode;

  constructor(@Inject(ArchiveService) private readonly archive: ArchiveService) {
    super();
  }

  init(node: ShellCommandNode): this {
    this._node = node;
    return this;
  }

  get node(): ShellCommandNode {
    if (!this._node) throw new Error('ShellCommandTool: node not initialized; call init() first');
    return this._node;
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

  private async saveOversizedOutputInContainer(
    container: ContainerHandle,
    filename: string,
    content: string,
  ): Promise<string> {
    const tar = await this.archive.createSingleFileTar(filename, content, 0o644);
    await container.putArchive(tar, { path: '/tmp' });
    return `/tmp/${filename}`;
  }

  async execute(args: z.infer<typeof bashCommandSchema>, ctx: LLMContext): Promise<string> {
    const { command, cwd } = args;
    const { threadId } = ctx;

    const provider = this.node.provider;
    if (!provider) throw new Error('ShellCommandTool: containerProvider not set. Connect via graph edge before use.');
    const container = await provider.provide(threadId);

    // Base env pulled from container; overlay from node config
    const baseEnv = undefined; // ContainerHandle does not expose getEnv; resolution handled via EnvService
    const envOverlay = await this.node.resolveEnv(baseEnv);
    const cfg = (this.node.config || {}) as z.infer<typeof ShellToolStaticConfigSchema>;
    const timeoutMs = cfg.executionTimeoutMs ?? 60 * 60 * 1000;
    const idleTimeoutMs = cfg.idleTimeoutMs ?? 60 * 1000;
    const staticWorkdir = typeof cfg.workdir === 'string' && cfg.workdir.trim() ? cfg.workdir.trim() : undefined;
    const workspaceRoot = this.normalizeWorkspaceRoot(this.node.getWorkspaceRoot());
    const baseForRelative = this.computeBaseWorkdir(cfg.workdir, workspaceRoot);

    let effectiveWorkdir = staticWorkdir;
    let requestedCwd: string | undefined;

    if (typeof cwd === 'string' && cwd.trim()) {
      const resolved = this.resolveCwd(cwd, baseForRelative, workspaceRoot);
      await this.ensureCwdExists(container, resolved);
      effectiveWorkdir = resolved;
      requestedCwd = resolved;
    }

    this.logger.info('Tool called', 'shell_command', {
      command,
      cwd: requestedCwd ?? null,
      effectiveWorkdir: effectiveWorkdir ?? null,
    });

    let response: { stdout: string; stderr: string; exitCode: number };
    try {
      response = await container.exec(command, {
        env: envOverlay,
        workdir: effectiveWorkdir,
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
    const combined = `${cleanedStdout}${cleanedStderr}`;
    const limit = typeof cfg.outputLimitChars === 'number' ? cfg.outputLimitChars : 0;
    if (limit > 0 && combined.length > limit) {
      const id = randomUUID();
      const file = `${id}.txt`;
      const path = await this.saveOversizedOutputInContainer(container, file, combined);
      return `Error: output length exceeds ${limit} characters. It was saved on disk: ${path}`;
    }
    if (response.exitCode !== 0) {
      const error = new Error(`Command exited with code ${response.exitCode}`);
      (error as Error & { code?: number; stdout?: string; stderr?: string }).code = response.exitCode;
      (error as Error & { code?: number; stdout?: string; stderr?: string }).stdout = cleanedStdout;
      (error as Error & { code?: number; stdout?: string; stderr?: string }).stderr = cleanedStderr;
      throw error;
    }

    return cleanedStdout;
  }

  private normalizeWorkspaceRoot(root?: string): string {
    const raw = typeof root === 'string' && root.trim() ? root.trim() : DEFAULT_WORKSPACE_ROOT;
    const normalized = pathPosix.normalize(raw);
    if (normalized === '/') return '/';
    return normalized.replace(/\/+$/, '');
  }

  private computeBaseWorkdir(staticWorkdir: string | undefined, workspaceRoot: string): string {
    if (typeof staticWorkdir === 'string' && staticWorkdir.trim()) {
      const trimmed = staticWorkdir.trim();
      const candidate = trimmed.startsWith('/') ? trimmed : pathPosix.join(workspaceRoot, trimmed);
      const normalized = pathPosix.normalize(candidate);
      if (this.isWithinWorkspace(normalized, workspaceRoot)) {
        return normalized;
      }
      this.logger.warn('ShellCommandTool: ignoring static workdir outside workspace root for cwd resolution', {
        configured: trimmed,
        workspaceRoot,
      });
    }
    return workspaceRoot;
  }

  private sanitizeCwdInput(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('Invalid cwd: value cannot be empty.');
    if (!SAFE_CWD_PATTERN.test(trimmed)) {
      throw new Error('Invalid cwd: only letters, numbers, ".", "-", "_" and "/" are allowed.');
    }
    const segments = trimmed.split('/');
    if (segments.some((segment) => segment === '..')) {
      throw new Error('Invalid cwd: ".." segments are not allowed.');
    }
    return trimmed.replace(/\/+/g, '/');
  }

  private isWithinWorkspace(candidate: string, workspaceRoot: string): boolean {
    const relative = pathPosix.relative(workspaceRoot, candidate);
    if (relative === '') return true;
    return !relative.startsWith('..') && !pathPosix.isAbsolute(relative);
  }

  private resolveCwd(rawCwd: string, base: string, workspaceRoot: string): string {
    const sanitized = this.sanitizeCwdInput(rawCwd);
    const joined = sanitized.startsWith('/') ? sanitized : pathPosix.join(base, sanitized);
    const normalized = pathPosix.normalize(joined);
    if (!this.isWithinWorkspace(normalized, workspaceRoot)) {
      throw new Error(`Invalid cwd: path must stay within workspace root "${workspaceRoot}".`);
    }
    return normalized;
  }

  private async ensureCwdExists(container: ContainerHandle, path: string): Promise<void> {
    const result = await container.exec(['test', '-d', path], { timeoutMs: 5000, idleTimeoutMs: 5000 });
    if (result.exitCode !== 0) {
      throw new Error(`Invalid cwd: directory "${path}" does not exist.`);
    }
  }
}
