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
import { PrismaService } from '../../../core/services/prisma.service';

// Schema for tool arguments
export const bashCommandSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      `Shell command to execute. Avoid interactive commands or watch mode. Use single quotes for cli arguments to prevent unexpected interpolation (do not wrap entire command in quotes). Commands run via a non-interactive bash wrapper that mirrors output to PID 1 for container logging, so you do not need to prefix with bash yourself (images must include /bin/bash).`,
    ),
  cwd: z.string().optional().describe('Optional working directory override applied for this command.'),
});

// Regex to strip ANSI escape sequences (colors, cursor moves, etc.)
// Matches ESC followed by a bracket and command bytes or other OSC sequences.
const ANSI_REGEX = /[\u001B\u009B][[[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;
const ANSI_OSC_REGEX = /\u001b\][^\u001b\u0007]*(?:\u0007|\u001b\\)/g;
const ANSI_STRING_REGEX = /\u001b[PX^_][^\u001b]*(?:\u001b\\)/g;

const ESC = '\u001b';
const BEL = '\u0007';

const isFinalByte = (code: number) => code >= 0x40 && code <= 0x7e;
const isIntermediateByte = (code: number) => code >= 0x20 && code <= 0x2f;

const isCompleteAnsiSequence = (sequence: string): boolean => {
  if (sequence.length < 2) return false;
  const second = sequence[1];
  if (!second) return false;
  if (second === '[') {
    for (let i = 2; i < sequence.length; i += 1) {
      const code = sequence.charCodeAt(i);
      if (isFinalByte(code)) return true;
    }
    return false;
  }
  if (second === ']') {
    for (let i = 2; i < sequence.length; i += 1) {
      const ch = sequence[i];
      if (ch === BEL) return true;
      if (ch === ESC && i + 1 < sequence.length && sequence[i + 1] === '\\') return true;
    }
    return false;
  }
  if (second === 'P' || second === '^' || second === '_') {
    for (let i = 2; i < sequence.length - 1; i += 1) {
      if (sequence[i] === ESC && sequence[i + 1] === '\\') return true;
    }
    return false;
  }
  const secondCode = second.charCodeAt(0);
  if (isFinalByte(secondCode)) return true;
  if (isIntermediateByte(secondCode)) {
    for (let i = 2; i < sequence.length; i += 1) {
      const code = sequence.charCodeAt(i);
      if (isFinalByte(code)) return true;
    }
    return false;
  }
  return sequence.length >= 2;
};

const splitAnsiSafePortion = (input: string): { safe: string; remainder: string } => {
  let remainderStart = input.length;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    if (input.charCodeAt(i) !== 0x1b) continue;
    const candidate = input.slice(i);
    if (!isCompleteAnsiSequence(candidate)) {
      remainderStart = i;
      continue;
    }
    break;
  }
  if (remainderStart === input.length) return { safe: input, remainder: '' };
  return { safe: input.slice(0, remainderStart), remainder: input.slice(remainderStart) };
};

class AnsiSequenceCleaner {
  private remainder = '';

  constructor(private readonly stripFn: (input: string) => string) {}

  consume(chunk: string): string {
    if (!chunk) return '';
    const combined = this.remainder + chunk;
    if (!combined) return '';
    const { safe, remainder } = splitAnsiSafePortion(combined);
    this.remainder = remainder;
    if (!safe) return '';
    return this.stripFn(safe);
  }

  flush(): string {
    const leftover = this.remainder;
    this.remainder = '';
    if (!leftover) return '';
    if (isCompleteAnsiSequence(leftover)) {
      return this.stripFn(leftover);
    }
    return '';
  }
}

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
    private readonly prismaService: PrismaService,
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
    return 'Execute a non-interactive shell command in the workspace container identified by thread_id and return combined stdout+stderr output.';
  }

  private stripAnsi(input: string): string {
    if (!input) return '';
    return input.replace(ANSI_OSC_REGEX, '').replace(ANSI_STRING_REGEX, '').replace(ANSI_REGEX, '');
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
      logToPid1: typeof cfg.logToPid1 === 'boolean' ? cfg.logToPid1 : true,
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

    const decoders: Record<OutputSource, TextDecoder> = {
      stdout: new TextDecoder('utf-8'),
      stderr: new TextDecoder('utf-8'),
    };

    const cleanBySource: Record<OutputSource, string> = { stdout: '', stderr: '' };
    const orderedSegments: Array<{ source: OutputSource; text: string }> = [];
    const cleaners: Record<OutputSource, AnsiSequenceCleaner> = {
      stdout: new AnsiSequenceCleaner((value) => this.stripAnsi(value)),
      stderr: new AnsiSequenceCleaner((value) => this.stripAnsi(value)),
    };

    const pushSegment = (source: OutputSource, text: string) => {
      if (!text) return;
      orderedSegments.push({ source, text });
      cleanBySource[source] += text;
    };

    const consumeDecoded = (source: OutputSource, decoded: string) => {
      if (!decoded) return;
      const cleaned = cleaners[source].consume(decoded);
      if (!cleaned) return;
      pushSegment(source, cleaned);
    };

    const flushDecoderRemainder = () => {
      (['stdout', 'stderr'] as OutputSource[]).forEach((source) => {
        const tail = decoders[source].decode();
        if (tail) consumeDecoded(source, tail);
        const flushed = cleaners[source].flush();
        if (flushed) pushSegment(source, flushed);
      });
    };

    const handleChunk = (source: OutputSource, chunk: Buffer) => {
      if (!chunk || chunk.length === 0) return;
      const decoded = decoders[source].decode(chunk, { stream: true });
      if (!decoded) return;
      consumeDecoded(source, decoded);
    };

    let response: { stdout: string; stderr: string; exitCode: number };
    const getCombinedOutput = (fallback?: { stdout?: string; stderr?: string }): string => {
      if (orderedSegments.length > 0) {
        return orderedSegments.map((segment) => segment.text).join('');
      }
      if (cleanBySource.stdout.length || cleanBySource.stderr.length) {
        return cleanBySource.stdout + cleanBySource.stderr;
      }
      if (fallback) {
        const stdoutClean = this.stripAnsi(fallback.stdout ?? '');
        const stderrClean = this.stripAnsi(fallback.stderr ?? '');
        if (stdoutClean.length || stderrClean.length) {
          return stdoutClean + stderrClean;
        }
      }
      const stdoutClean = this.stripAnsi(response?.stdout ?? '');
      const stderrClean = this.stripAnsi(response?.stderr ?? '');
      return stdoutClean + stderrClean;
    };

    try {
      response = await container.exec(command, {
        env: envOverlay,
        workdir: cwd ?? cfg.workdir,
        timeoutMs,
        idleTimeoutMs,
        killOnTimeout: true,
        logToPid1: cfg.logToPid1,
        onOutput: (source, chunk) => handleChunk(source as OutputSource, chunk),
      });
      flushDecoderRemainder();
    } catch (err: unknown) {
      if (isExecTimeoutError(err) || isExecIdleTimeoutError(err)) {
        flushDecoderRemainder();
        const timeoutErr = err as ExecTimeoutError | ExecIdleTimeoutError;
        const combined = getCombinedOutput({ stdout: timeoutErr.stdout ?? '', stderr: timeoutErr.stderr ?? '' });
        const tail = combined.length > 10000 ? combined.slice(-10000) : combined;
        if (isExecIdleTimeoutError(err)) {
          const idleMs = timeoutErr.timeoutMs ?? idleTimeoutMs;
          throw new Error(
            `Error (idle timeout): no output for ${idleMs}ms; command was terminated. See output tail below.\n----------\n${tail}`,
          );
        } else {
          const usedMs = timeoutErr.timeoutMs ?? timeoutMs;
          throw new Error(
            `Error (timeout after ${usedMs}ms): command exceeded ${usedMs}ms and was terminated. See output tail below.\n----------\n${tail}`,
          );
        }
      }

      if (this.isConnectionInterruption(err)) {
        const message = await this.buildInterruptionMessage(container.id);
        throw new Error(message);
      }
      throw err;
    }

    const combined = getCombinedOutput({ stdout: response.stdout, stderr: response.stderr });
    const limit = cfg.outputLimitChars;
    if (limit > 0 && combined.length > limit) {
      const id = randomUUID();
      const file = `${id}.txt`;
      const path = await this.saveOversizedOutputInContainer(container, file, combined);
      return `Error: output length exceeds ${limit} characters. It was saved on disk: ${path}`;
    }

    return combined;
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
    const cleaners: Record<OutputSource, AnsiSequenceCleaner> = {
      stdout: new AnsiSequenceCleaner((value) => this.stripAnsi(value)),
      stderr: new AnsiSequenceCleaner((value) => this.stripAnsi(value)),
    };

    type BufferState = { text: string; bytes: number; timer: NodeJS.Timeout | null };
    const buffers: Record<OutputSource, BufferState> = {
      stdout: { text: '', bytes: 0, timer: null },
      stderr: { text: '', bytes: 0, timer: null },
    };

    const bytesBySource: Record<OutputSource, number> = { stdout: 0, stderr: 0 };
    const seqPerSource: Record<OutputSource, number> = { stdout: 0, stderr: 0 };
    let segmentOrder = 0;
    const pendingSegments: Record<OutputSource, { order: number; text: string }[]> = {
      stdout: [],
      stderr: [],
    };
    const orderedOutput: Array<{ order: number; text: string }> = [];

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
      const segmentsForFlush = pendingSegments[source];
      pendingSegments[source] = [];
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
        if (segmentsForFlush.length > 0) {
          orderedOutput.push(...segmentsForFlush);
        }
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

      segmentOrder += 1;
      pendingSegments[source].push({ order: segmentOrder, text: cleaned });

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
      const cleaned = cleaners[source].consume(decoded);
      if (!cleaned) return;
      const byteLength = Buffer.byteLength(cleaned, 'utf8');
      handleDecoratedChunk(source, cleaned, byteLength);
    };

    const getCombinedOutput = (): string => {
      if (orderedOutput.length > 0) {
        return orderedOutput
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((entry) => entry.text)
          .join('');
      }
      return `${cleanedStdout}${cleanedStderr}`;
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
        logToPid1: cfg.logToPid1,
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
        const cleanedTail = cleaners.stdout.consume(stdoutTail);
        if (cleanedTail) {
          handleDecoratedChunk('stdout', cleanedTail, Buffer.byteLength(cleanedTail, 'utf8'));
        }
      }
      const flushedStdout = cleaners.stdout.flush();
      if (flushedStdout) {
        handleDecoratedChunk('stdout', flushedStdout, Buffer.byteLength(flushedStdout, 'utf8'));
      }
      const stderrTail = decoders.stderr.decode();
      if (stderrTail) {
        const cleanedTail = cleaners.stderr.consume(stderrTail);
        if (cleanedTail) {
          handleDecoratedChunk('stderr', cleanedTail, Buffer.byteLength(cleanedTail, 'utf8'));
        }
      }
      const flushedStderr = cleaners.stderr.flush();
      if (flushedStderr) {
        handleDecoratedChunk('stderr', flushedStderr, Buffer.byteLength(flushedStderr, 'utf8'));
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
        const combined = getCombinedOutput();
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

    return getCombinedOutput();
  }

  private isConnectionInterruption(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const anyErr = err as { code?: unknown; message?: unknown; stack?: unknown };
    const code = typeof anyErr.code === 'string' ? anyErr.code : undefined;
    const msg = typeof anyErr.message === 'string' ? anyErr.message : undefined;

    const interruptionCodes = new Set(['ERR_IPC_CHANNEL_CLOSED', 'ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ESHUTDOWN']);

    if (code && interruptionCodes.has(code)) return true;
    if (!msg) return false;
    const lowered = msg.toLowerCase();
    return lowered.includes('channel closed') || lowered.includes('broken pipe') || lowered.includes('econnreset');
  }

  private async buildInterruptionMessage(containerId: string): Promise<string> {
    try {
      const prisma = this.prismaService.getClient();
      const container = await prisma.container.findUnique({
        where: { containerId },
        select: { id: true, dockerContainerId: true, threadId: true },
      });
      if (!container) {
        return 'Shell command interrupted: workspace container connection closed unexpectedly (container record missing).';
      }

      const event = await prisma.containerEvent.findFirst({
        where: { containerDbId: container.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!event) {
        return 'Shell command interrupted: workspace container connection closed unexpectedly. No Docker termination event was recorded.';
      }

      const segments: string[] = [];
      const timestamp = event.createdAt ? event.createdAt.toISOString() : undefined;
      const reason = event.reason ?? 'Unknown reason';
      let headline = `Shell command interrupted: workspace container reported ${reason}`;
      if (timestamp) headline = `${headline} at ${timestamp}`;
      segments.push(headline);
      const signal = event.signal ?? undefined;
      const exitCode = typeof event.exitCode === 'number' ? event.exitCode : undefined;
      const extras: string[] = [];
      if (typeof exitCode === 'number') extras.push(`exitCode=${exitCode}`);
      if (signal) extras.push(`signal=${signal}`);
      if (container.dockerContainerId) extras.push(`dockerId=${container.dockerContainerId.slice(0, 12)}`);
      if (container.threadId) extras.push(`threadId=${container.threadId}`);
      if (extras.length > 0) segments.push(`Details: ${extras.join(', ')}`);
      const message = event.message ?? undefined;
      if (message) segments.push(`Docker message: ${message}`);
      return `${segments.join('. ')}.`;
    } catch (error) {
      this.logger.error('ShellCommandTool: failed to build interruption message', { error, containerId });
      return 'Shell command interrupted: workspace container connection closed unexpectedly. Failed to read termination details.';
    }
  }
}
