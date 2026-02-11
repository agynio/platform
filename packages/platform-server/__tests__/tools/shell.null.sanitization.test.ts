import { describe, it, expect, vi } from 'vitest';
import { ShellCommandTool } from '../../src/nodes/tools/shell_command/shell_command.tool';
import type { RunEventsService } from '../../src/events/run-events.service';
import type { EventsBusService } from '../../src/events/events-bus.service';
import type { PrismaService } from '../../src/core/services/prisma.service';

const streamingCtx = {
  threadId: 'thread-1',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

const createTool = (options?: {
  execImpl?: (
    command: string,
    opts?: { onOutput?: (source: string, chunk: Buffer) => void },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  runEventsOverrides?: Pick<RunEventsService, 'appendToolOutputChunk' | 'finalizeToolOutputTerminal'>;
  eventsBusOverrides?: Pick<EventsBusService, 'emitToolOutputChunk' | 'emitToolOutputTerminal'>;
}) => {
  const archive = {
    createSingleFileTar: vi.fn().mockResolvedValue(Buffer.from('')),
  } as any;

  const prismaStub = {
    getClient: vi.fn(() => ({
      container: { findUnique: vi.fn(async () => null) },
      containerEvent: { findFirst: vi.fn(async () => null) },
    })),
  } as unknown as PrismaService;

  const runEvents =
    options?.runEventsOverrides ??
    ({
      appendToolOutputChunk: vi.fn(async (payload) => ({ ...payload, id: 'chunk-1' })),
      finalizeToolOutputTerminal: vi.fn(async (payload) => ({ ...payload, id: 'terminal-1' })),
    } as unknown as Pick<RunEventsService, 'appendToolOutputChunk' | 'finalizeToolOutputTerminal'>);

  const eventsBus =
    options?.eventsBusOverrides ??
    ({
      emitToolOutputChunk: vi.fn(),
      emitToolOutputTerminal: vi.fn(),
    } as unknown as Pick<EventsBusService, 'emitToolOutputChunk' | 'emitToolOutputTerminal'>);

  const tool = new ShellCommandTool(archive, runEvents as RunEventsService, eventsBus as EventsBusService, prismaStub);
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  (tool as any).logger = logger;

  const exec =
    options?.execImpl ??
    (async () => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
    }));

  const container = {
    exec,
    putArchive: vi.fn(async () => undefined),
  };

  const nodeStub = {
    config: {},
    provider: { provide: vi.fn(async () => container) },
    resolveEnv: vi.fn(async () => ({} as Record<string, string>)),
  };

  tool.init(nodeStub as any);
  return { tool, runEvents, eventsBus, container };
};

describe('ShellCommandTool NUL sanitization', () => {
  it('strips NUL characters from streaming output before persistence', async () => {
    const append = vi.fn(async (payload: any) => ({ ...payload, id: 'chunk-id' }));
    const finalize = vi.fn(async (payload: any) => ({ ...payload, id: 'terminal-id' }));

    const { tool, eventsBus } = createTool({
      execImpl: async (_command, opts) => {
        opts?.onOutput?.('stdout', Buffer.from('hello\u0000world\n', 'utf8'));
        opts?.onOutput?.('stderr', Buffer.from('err\u0000line', 'utf8'));
        return { stdout: 'hello\u0000world\n', stderr: 'err\u0000line', exitCode: 0 };
      },
      runEventsOverrides: {
        appendToolOutputChunk: append,
        finalizeToolOutputTerminal: finalize,
      },
    });

    const result = await tool.executeStreaming({ command: 'emit-nul' }, streamingCtx as any, {
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
    });

    expect(result).toBe('helloworld\nerrline');
    expect(result.includes('\u0000')).toBe(false);

    expect(append).toHaveBeenCalled();
    const persistedChunks = append.mock.calls.map(([payload]) => payload.data);
    persistedChunks.forEach((data: string) => expect(data.includes('\u0000')).toBe(false));
    expect(persistedChunks).toContain('helloworld\n');
    expect(persistedChunks).toContain('errline');

    expect(eventsBus.emitToolOutputChunk).toHaveBeenCalled();
    const emittedChunks = (eventsBus.emitToolOutputChunk as any).mock.calls.map(([payload]: [{ data: string }]) => payload.data);
    emittedChunks.forEach((data: string) => expect(data.includes('\u0000')).toBe(false));

    expect(finalize).toHaveBeenCalled();
    const finalizePayload = finalize.mock.calls[0][0];
    if (finalizePayload.message) {
      expect(finalizePayload.message.includes('\u0000')).toBe(false);
    }

    expect(eventsBus.emitToolOutputTerminal).toHaveBeenCalled();
    const terminalEvent = (eventsBus.emitToolOutputTerminal as any).mock.calls[0][0];
    expect((terminalEvent.message ?? '').includes('\u0000')).toBe(false);
  });

  it('removes NUL characters from synchronous execution result', async () => {
    const { tool } = createTool({
      execImpl: async (_command, opts) => {
        opts?.onOutput?.('stdout', Buffer.from('alpha\u0000beta', 'utf8'));
        return { stdout: 'alpha\u0000beta', stderr: '', exitCode: 0 };
      },
    });

    const result = await tool.execute({ command: 'emit-nul' }, { threadId: 'thread-2' } as any);

    expect(result).toBe('alphabeta');
    expect(result.includes('\u0000')).toBe(false);
  });

  it('decodes UTF-16 tail output and strips embedded NUL characters', async () => {
    const append = vi.fn(async (payload: any) => ({ ...payload, id: 'chunk-id' }));
    const finalize = vi.fn(async (payload: any) => ({ ...payload, id: 'terminal-id' }));

    const utf16 = (text: string, includeBom = false) => {
      const body = Buffer.from(text, 'utf16le');
      return includeBom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
    };

    const header = utf16('==> /tmp/next-dev.log <==\n', true);
    const chunks = [
      header.subarray(0, 5),
      header.subarray(5),
      utf16('line\u0000one\n'),
      utf16('line two\n'),
    ];

    const { tool, runEvents } = createTool({
      execImpl: async (_command, opts) => {
        chunks.forEach((chunk) => opts?.onOutput?.('stdout', chunk));
        return { stdout: '==> /tmp/next-dev.log <==\nline\u0000one\nline two\n', stderr: '', exitCode: 0 };
      },
      runEventsOverrides: {
        appendToolOutputChunk: append,
        finalizeToolOutputTerminal: finalize,
      },
    });

    const result = await tool.executeStreaming({ command: 'tail-next-dev' }, streamingCtx as any, {
      runId: 'run-utf16',
      threadId: 'thread-utf16',
      eventId: 'event-utf16',
    });

    expect(result.includes('\u0000')).toBe(false);
    expect(result).toContain('==> /tmp/next-dev.log <==\n');

    expect(append).toHaveBeenCalled();
    append.mock.calls.forEach(([payload]) => {
      expect(payload.data.includes('\u0000')).toBe(false);
      expect(payload.data).toContain('/tmp/next-dev.log');
    });

    expect(finalize).toHaveBeenCalled();
    const terminalPayload = finalize.mock.calls[0][0];
    expect((terminalPayload.message ?? '').includes('\u0000')).toBe(false);
    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalled();
  });
});
