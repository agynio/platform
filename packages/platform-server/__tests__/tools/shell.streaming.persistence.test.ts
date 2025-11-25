import { describe, it, expect, vi } from 'vitest';
import { ShellCommandTool } from '../../src/nodes/tools/shell_command/shell_command.tool';
import type { RunEventsService } from '../../src/events/run-events.service';
import type { EventsBusService } from '../../src/events/events-bus.service';
import type { PrismaService } from '../../src/core/services/prisma.service';

const ctx = {
  threadId: 'thread-1',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

const createTool = (
  runEvents: Pick<RunEventsService, 'appendToolOutputChunk' | 'finalizeToolOutputTerminal'>,
  eventsBus?: Pick<EventsBusService, 'emitToolOutputChunk' | 'emitToolOutputTerminal'>,
) => {
  const archive = { createSingleFileTar: vi.fn().mockResolvedValue(Buffer.from('')) } as any;
  const prismaStub = {
    getClient: vi.fn(() => ({
      container: { findUnique: vi.fn(async () => null) },
      containerEvent: { findFirst: vi.fn(async () => null) },
    })),
  } as unknown as PrismaService;
  const bus =
    eventsBus ??
    ({
      emitToolOutputChunk: vi.fn(),
      emitToolOutputTerminal: vi.fn(),
    } as unknown as EventsBusService);
  const tool = new ShellCommandTool(archive, runEvents as RunEventsService, bus, prismaStub as PrismaService);
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  (tool as any).logger = logger;

  const container = new (class {
    async exec(_command: string, options?: { onOutput?: (source: string, chunk: Buffer) => void }) {
      options?.onOutput?.('stdout', Buffer.from('chunk-line\n'));
      options?.onOutput?.('stdout', Buffer.from('final output\n'));
      return { stdout: 'chunk-line\nfinal output\n', stderr: '', exitCode: 0 };
    }
    async putArchive() {
      return;
    }
  })();

  const nodeStub = {
    config: {},
    provider: { provide: async () => container },
    resolveEnv: async () => ({} as Record<string, string>),
  };

  tool.init(nodeStub as any);
  return { tool, logger, eventsBus: bus };
};

describe('ShellCommandTool streaming persistence resilience', () => {
  it('logs and continues when run events persistence fails', async () => {
    const append = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const finalize = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const { tool, logger, eventsBus } = createTool({ appendToolOutputChunk: append, finalizeToolOutputTerminal: finalize });

    const result = await tool.executeStreaming({ command: 'echo test' }, ctx as any, {
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
    });

    expect(result).toBe('chunk-line\nfinal output\n');
    expect(append).toHaveBeenCalled();
    expect(finalize).toHaveBeenCalled();
    expect(logger.warn.mock.calls.some(([msg]) => String(msg).includes('ShellCommandTool chunk persistence failed; continuing without storing chunk eventId=event-1 seqGlobal=1 source=stdout error=db unavailable'))).toBe(true);
    expect(logger.warn.mock.calls.some(([msg]) => String(msg).includes('ShellCommandTool failed to record terminal summary; continuing eventId=event-1 error=db unavailable'))).toBe(true);
    expect(eventsBus.emitToolOutputChunk).not.toHaveBeenCalled();
    expect(eventsBus.emitToolOutputTerminal).not.toHaveBeenCalled();
  });
});
