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
import { randomUUID } from 'node:crypto';
import { Injectable, Scope } from '@nestjs/common';
import { ArchiveService } from '../../../infra/archive/archive.service';
import { ContainerHandle } from '../../../infra/container/container.handle';
import { RunEventsService } from '../../../events/run-events.service';
import { EventsBusService } from '../../../events/events-bus.service';
import { ToolOutputStatus } from '@prisma/client';

// Schema for tool arguments
export const bashCommandSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      `Shell command to execute. Avoid interactive commands or watch mode. Use single quotes for cli arguments to prevent unexpected interpolation (do not wrap entire command in quotes). Command is executed in wrapper \`bash -lc '<COMMAND>'\`, no need to add bash invocation.`,
    ),
  cwd: z.string().optional().describe('Optional working directory override applied for this command.'),
});

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX = /[\u001B\u009B][[[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;

const DEFAULT_CHUNK_COALESCE_MS = 40;
const DEFAULT_CHUNK_SIZE_BYTES = 4 * 1024;
const DEFAULT_CLIENT_BUFFER_BYTES = 10 * 1024 * 1024;

type OutputSource = 'stdout' | 'stderr';

type StreamingOptions = {
  runId: string;
  threadId: string;
  eventId: string;
};

@Injectable({ scope: Scope.TRANSIENT })
export class ShellCommandTool extends FunctionTool<typeof bashCommandSchema> {
  private _node?: ShellCommandNode;

  constructor(
    private readonly archive: ArchiveService,
    private readonly runEvents: RunEventsService,
    private readonly eventsBus: EventsBusService,
    private readonly logger: LoggerService,
  ) {
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

  private getResolvedConfig() {
    const cfg = (this.node.config || {}) as z.infer<typeof ShellToolStaticConfigSchema>;
    return {
      workdir: cfg.workdir ?? undefined,
      executionTimeoutMs: typeof cfg.executionTimeoutMs === 'number' ? cfg.executionTimeoutMs : 60 * 60 * 1000,
      idleTimeoutMs: typeof cfg.idleTimeoutMs === 'number' ? cfg.idleTimeoutMs : 60 * 1000,
      outputLimitChars: typeof cfg.outputLimitChars === 'number' ? cfg.outputLimitChars : 0,
      chunkCoalesceMs: typeof cfg.chunkCoalesceMs === 'number' ? cfg.chunkCoalesceMs : DEFAULT_CHUNK_COALESCE_MS,
      chunkSizeBytes: typeof cfg.chunkSizeBytes === 'number' ? cfg.chunkSizeBytes : DEFAULT_CHUNK_SIZE_BYTES,
      clientBufferLimitBytes:
        typeof cfg.clientBufferLimitBytes === 'number' ? cfg.clientBufferLimitBytes : DEFAULT_CLIENT_BUFFER_BYTES,
    };
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
    this.logger.info('Tool called', 'shell_command', { command });

    // Base env pulled from container; overlay from node config
    const baseEnv = undefined; // ContainerHandle does not expose getEnv; resolution handled via EnvService
    const envOverlay = await this.node.resolveEnv(baseEnv);
    const cfg = this.getResolvedConfig();
    const timeoutMs = cfg.executionTimeoutMs;
    const idleTimeoutMs = cfg.idleTimeoutMs;

    let response: { stdout: string; stderr: string; exitCode: number };
    try {
      response = await container.exec(command, {
        env: envOverlay,
        workdir: cwd ?? cfg.workdir,
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
    const limit = cfg.outputLimitChars;
    if (limit > 0 && combined.length > limit) {
      const id = randomUUID();
      const file = `${id}.txt`;
      const path = await this.saveOversizedOutputInContainer(container, file, combined);
      return `Error: output length exceeds ${limit} characters. It was saved on disk: ${path}`;
    }
    if (response.exitCode !== 0) {
      return `Error (exit code ${response.exitCode}):\n${cleanedStdout}\n${cleanedStderr}`;
    }

    return cleanedStdout;
  }

  async executeStreaming(
    args: z.infer<typeof bashCommandSchema>,
    ctx: LLMContext,
    options: StreamingOptions,
  ): Promise<string> {
    const { command, cwd } = args;
    const provider = this.node.provider;
    if (!provider) throw new Error('ShellCommandTool: containerProvider not set. Connect via graph edge before use.');
    const container = await provider.provide(options.threadId);
    this.logger.info('Tool streaming start', 'shell_command', { command, eventId: options.eventId });

    const envOverlay = await this.node.resolveEnv(undefined);
    const cfg = this.getResolvedConfig();
    const coalesceMs = Math.max(5, Math.trunc(cfg.chunkCoalesceMs));
    const chunkSizeBytes = Math.max(512, Math.trunc(cfg.chunkSizeBytes));
    const clientBufferLimitBytes = Math.max(0, Math.trunc(cfg.clientBufferLimitBytes));
    const outputLimit = cfg.outputLimitChars;

    const decoders: Record<OutputSource, TextDecoder> = {
      stdout: new TextDecoder('utf-8'),
      stderr: new TextDecoder('utf-8'),
    };

    type BufferState = { text: string; bytes: number; timer: NodeJS.Timeout | null };
    const buffers: Record<OutputSource, BufferState> = {
      stdout: { text: '', bytes: 0, timer: null },
      stderr: { text: '', bytes: 0, timer: null },
    };

    const bytesBySource: Record<OutputSource, number> = { stdout: 0, stderr: 0 };
    const seqPerSource: Record<OutputSource, number> = { stdout: 0, stderr: 0 };

    let seqGlobal = 0;
    let totalChunks = 0;
    let droppedChunks = 0;
    let emittedBytes = 0;
    let allowNextChunkAfterTruncate = false;
    let truncated = false;
    let truncatedReason: 'output_limit' | 'client_buffer' | null = null;
    let truncationMessage: string | null = null;
    let savedPath: string | null = null;
    let truncatedSource: OutputSource | null = null;

    let terminalStatus: ToolOutputStatus = 'success';
    let exitCode: number | null = null;

    let cleanedStdout = '';
    let cleanedStderr = '';

    let flushChain = Promise.resolve();

    const flushBuffer = (source: OutputSource, opts?: { force?: boolean }) => {
      const buffer = buffers[source];
      if (!opts?.force && buffer.text.length === 0) return;
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }
      const text = buffer.text;
      const textBytes = buffer.bytes;
      buffer.text = '';
      buffer.bytes = 0;
      if (!text) return;
      flushChain = flushChain.then(async () => {
        totalChunks += 1;
        if (truncated) {
          if (allowNextChunkAfterTruncate && truncatedSource === source) {
            allowNextChunkAfterTruncate = false;
          } else {
            droppedChunks += 1;
            return;
          }
        }
        if (clientBufferLimitBytes > 0 && emittedBytes + textBytes > clientBufferLimitBytes) {
          truncated = true;
          truncatedReason = 'client_buffer';
          truncatedSource = null;
          if (!truncationMessage) {
            const mb = (clientBufferLimitBytes / (1024 * 1024)).toFixed(2);
            truncationMessage = `Streaming truncated after reaching ${mb} MB of output.`;
          }
          droppedChunks += 1;
          return;
        }
        seqGlobal += 1;
        seqPerSource[source] += 1;
        emittedBytes += textBytes;
        try {
          const payload = await this.runEvents.appendToolOutputChunk({
            runId: options.runId,
            threadId: options.threadId,
            eventId: options.eventId,
            seqGlobal,
            seqStream: seqPerSource[source],
            source,
            data: text,
            bytes: textBytes,
            ts: new Date(),
          });
          this.eventsBus.emitToolOutputChunk(payload);
        } catch (err) {
          droppedChunks += 1;
          this.logger.warn('ShellCommandTool chunk persistence failed; continuing without storing chunk', {
            eventId: options.eventId,
            seqGlobal,
            source,
            err,
          });
        }
      });
    };

    const scheduleFlush = (source: OutputSource) => {
      const buffer = buffers[source];
      if (buffer.timer) return;
      const timer = setTimeout(() => flushBuffer(source), coalesceMs);
      if (typeof timer.unref === 'function') timer.unref();
      buffer.timer = timer;
    };

    const handleDecoratedChunk = (source: OutputSource, cleaned: string, byteLength: number) => {
      if (!cleaned) return;
      if (source === 'stdout') cleanedStdout += cleaned;
      else cleanedStderr += cleaned;
      bytesBySource[source] += byteLength;

      const buffer = buffers[source];
      buffer.text += cleaned;
      buffer.bytes += byteLength;

      if (buffer.bytes >= chunkSizeBytes || buffer.text.length >= chunkSizeBytes) {
        flushBuffer(source);
      } else {
        scheduleFlush(source);
      }

      if (!truncated && outputLimit > 0) {
        const totalLength = cleanedStdout.length + cleanedStderr.length;
        if (totalLength > outputLimit) {
          truncated = true;
          truncatedReason = 'output_limit';
          truncatedSource = source;
          allowNextChunkAfterTruncate = true;
        }
      }
    };

    const handleChunk = (source: OutputSource, chunk: Buffer) => {
      if (!chunk || chunk.length === 0) return;
      const decoded = decoders[source].decode(chunk, { stream: true });
      if (!decoded) return;
      const cleaned = this.stripAnsi(decoded);
      if (!cleaned) return;
      const byteLength = Buffer.byteLength(cleaned, 'utf8');
      handleDecoratedChunk(source, cleaned, byteLength);
    };

    let execError: unknown = null;
    let response: { stdout: string; stderr: string; exitCode: number } | null = null;

    try {
      response = await container.exec(command, {
        env: envOverlay,
        workdir: cwd ?? cfg.workdir,
        timeoutMs: cfg.executionTimeoutMs,
        idleTimeoutMs: cfg.idleTimeoutMs,
        killOnTimeout: true,
        onOutput: (source, chunk) => {
          if (truncated && !allowNextChunkAfterTruncate) return;
          handleChunk(source as OutputSource, chunk);
        },
      });
    } catch (err) {
      execError = err;
      if (err instanceof ExecTimeoutError) {
        terminalStatus = 'timeout';
        exitCode = null;
        const stdoutClean = this.stripAnsi(err.stdout ?? '');
        const stderrClean = this.stripAnsi(err.stderr ?? '');
        cleanedStdout = stdoutClean;
        cleanedStderr = stderrClean;
        bytesBySource.stdout = Buffer.byteLength(stdoutClean, 'utf8');
        bytesBySource.stderr = Buffer.byteLength(stderrClean, 'utf8');
        truncationMessage = `Command timed out after ${(cfg.executionTimeoutMs ?? 0)}ms.`;
      } else if (err instanceof ExecIdleTimeoutError) {
        terminalStatus = 'idle_timeout';
        exitCode = null;
        const stdoutClean = this.stripAnsi(err.stdout ?? '');
        const stderrClean = this.stripAnsi(err.stderr ?? '');
        cleanedStdout = stdoutClean;
        cleanedStderr = stderrClean;
        bytesBySource.stdout = Buffer.byteLength(stdoutClean, 'utf8');
        bytesBySource.stderr = Buffer.byteLength(stderrClean, 'utf8');
        truncationMessage = `Command produced no output for ${(cfg.idleTimeoutMs ?? 0)}ms.`;
      } else {
        terminalStatus = 'error';
      }
    } finally {
      const stdoutTail = decoders.stdout.decode();
      if (stdoutTail) {
        const cleanedTail = this.stripAnsi(stdoutTail);
        if (cleanedTail) handleDecoratedChunk('stdout', cleanedTail, Buffer.byteLength(cleanedTail, 'utf8'));
      }
      const stderrTail = decoders.stderr.decode();
      if (stderrTail) {
        const cleanedTail = this.stripAnsi(stderrTail);
        if (cleanedTail) handleDecoratedChunk('stderr', cleanedTail, Buffer.byteLength(cleanedTail, 'utf8'));
      }
      flushBuffer('stdout', { force: true });
      flushBuffer('stderr', { force: true });
      try {
        await flushChain;
      } catch (flushErr) {
        this.logger.warn('ShellCommandTool flushChain error', { eventId: options.eventId, error: flushErr });
      }

      if (response) {
        const cleanedStdoutFinal = this.stripAnsi(response.stdout ?? '');
        const cleanedStderrFinal = this.stripAnsi(response.stderr ?? '');
        cleanedStdout = cleanedStdoutFinal;
        cleanedStderr = cleanedStderrFinal;
        exitCode = response.exitCode;
        if (truncated) {
          terminalStatus = 'truncated';
        } else if (terminalStatus !== 'timeout' && terminalStatus !== 'idle_timeout') {
          terminalStatus = response.exitCode === 0 ? 'success' : 'error';
        }
      }

      if (truncated) {
        const combined = `${cleanedStdout}${cleanedStderr}`;
        if (combined.length > 0) {
          try {
            const file = `${randomUUID()}.txt`;
            savedPath = await this.saveOversizedOutputInContainer(container, file, combined);
          } catch (saveErr) {
            this.logger.warn('ShellCommandTool failed to persist truncated output', {
              eventId: options.eventId,
              error: saveErr,
            });
          }
        }
        if (!truncationMessage) {
          if (truncatedReason === 'output_limit' && outputLimit > 0) {
            truncationMessage = `Output truncated after ${outputLimit} characters.`;
          } else if (truncatedReason === 'client_buffer' && clientBufferLimitBytes > 0) {
            const mb = (clientBufferLimitBytes / (1024 * 1024)).toFixed(2);
            truncationMessage = `Output truncated after streaming ${mb} MB.`;
          } else {
            truncationMessage = 'Output truncated.';
          }
        }
        if (savedPath) {
          truncationMessage = `${truncationMessage} Full output saved to ${savedPath}.`;
        }
      }

      try {
        const payload = await this.runEvents.finalizeToolOutputTerminal({
          runId: options.runId,
          threadId: options.threadId,
          eventId: options.eventId,
          exitCode,
          status: terminalStatus,
          bytesStdout: bytesBySource.stdout,
          bytesStderr: bytesBySource.stderr,
          totalChunks,
          droppedChunks,
          savedPath,
          message: truncationMessage,
        });
        this.eventsBus.emitToolOutputTerminal(payload);
      } catch (eventErr) {
        this.logger.warn('ShellCommandTool failed to record terminal summary; continuing', {
          eventId: options.eventId,
          error: eventErr,
        });
      }
    }

    if (execError) {
      throw execError;
    }

    if (terminalStatus === 'truncated') {
      return truncationMessage ?? (savedPath ? `Output truncated. Full output saved to ${savedPath}.` : 'Output truncated.');
    }

    if (exitCode !== null && exitCode !== 0) {
      return `Error (exit code ${exitCode}):\n${cleanedStdout}\n${cleanedStderr}`;
    }

    return cleanedStdout;
  }
}
