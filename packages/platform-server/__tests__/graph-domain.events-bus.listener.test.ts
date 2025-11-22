import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventsBusService, RunEventBusPayload } from '../src/events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { GraphEventsBusListener } from '../src/graph-domain/listeners/graph-events-bus.listener';
import { GraphEventsPublisher } from '../src/gateway/graph.events.publisher';

class MockGraphEventsPublisher extends GraphEventsPublisher {
  emitThreadCreated = vi.fn();
  emitThreadUpdated = vi.fn();
  emitMessageCreated = vi.fn();
  emitRunStatusChanged = vi.fn();
  emitRunEvent = vi.fn();
  emitToolOutputChunk = vi.fn();
  emitToolOutputTerminal = vi.fn();
  scheduleThreadMetrics = vi.fn();
  scheduleThreadAndAncestorsMetrics = vi.fn();
  emitReminderCount = vi.fn();
}

describe('GraphEventsBusListener', () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  let publisher: MockGraphEventsPublisher;
  let runEventListener: ((payload: RunEventBusPayload) => void) | null;
  let chunkListener: ((payload: ToolOutputChunkPayload) => void) | null;
  let terminalListener: ((payload: ToolOutputTerminalPayload) => void) | null;
  let runDispose: ReturnType<typeof vi.fn>;
  let chunkDispose: ReturnType<typeof vi.fn>;
  let terminalDispose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    publisher = new MockGraphEventsPublisher();
    runEventListener = null;
    chunkListener = null;
    terminalListener = null;
    runDispose = vi.fn();
    chunkDispose = vi.fn();
    terminalDispose = vi.fn();
    vi.clearAllMocks();
  });

  const createListener = async () => {
    const eventsBus: Pick<EventsBusService, 'subscribeToRunEvents' | 'subscribeToToolOutputChunk' | 'subscribeToToolOutputTerminal'> = {
      subscribeToRunEvents: (listener) => {
        runEventListener = listener;
        return runDispose;
      },
      subscribeToToolOutputChunk: (listener) => {
        chunkListener = listener;
        return chunkDispose;
      },
      subscribeToToolOutputTerminal: (listener) => {
        terminalListener = listener;
        return terminalDispose;
      },
    };
    const moduleRef = {
      resolve: vi.fn().mockResolvedValue(publisher),
    } as any;
    const listener = new GraphEventsBusListener(eventsBus as EventsBusService, moduleRef, logger as any);
    await listener.onModuleInit();
    return { listener, eventsBus, moduleRef };
  };

  it('emits run events via publisher', async () => {
    await createListener();
    expect(runEventListener).toBeInstanceOf(Function);
    runEventListener!({
      eventId: 'event-1',
      mutation: 'append',
      event: {
        id: 'event-1',
        runId: 'run-1',
        threadId: 'thread-1',
        type: 'tool_execution',
        status: 'success',
        ts: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        durationMs: null,
        nodeId: null,
        sourceKind: 'system',
        sourceSpanId: null,
        metadata: null,
        errorCode: null,
        errorMessage: null,
        attachments: [],
      } as any,
    });
    expect(publisher.emitRunEvent).toHaveBeenCalledWith('run-1', 'thread-1', {
      runId: 'run-1',
      mutation: 'append',
      event: expect.objectContaining({ id: 'event-1' }),
    });
  });

  it('converts tool output chunk timestamps to Date objects', async () => {
    await createListener();
    expect(chunkListener).toBeInstanceOf(Function);
    chunkListener!({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: '2025-01-01T00:00:00.000Z',
      data: 'chunk',
    });
    expect(publisher.emitToolOutputChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'event-1',
        ts: expect.any(Date),
      }),
    );
    const payload = publisher.emitToolOutputChunk.mock.calls[0]?.[0];
    expect(payload.ts.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('logs and skips invalid chunk timestamps', async () => {
    await createListener();
    chunkListener!({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: 'invalid',
      data: 'chunk',
    });
    expect(publisher.emitToolOutputChunk).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'GraphEventsBusListener received invalid chunk timestamp',
      expect.objectContaining({ eventId: 'event-1', ts: 'invalid' }),
    );
  });

  it('emits tool output terminal payloads', async () => {
    await createListener();
    expect(terminalListener).toBeInstanceOf(Function);
    terminalListener!({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      exitCode: 0,
      status: 'success',
      bytesStdout: 10,
      bytesStderr: 0,
      totalChunks: 2,
      droppedChunks: 0,
      savedPath: null,
      message: null,
      ts: '2025-01-01T00:00:00.000Z',
    });
    expect(publisher.emitToolOutputTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'event-1',
        ts: expect.any(Date),
        status: 'success',
      }),
    );
  });

  it('cleans up subscriptions on destroy', async () => {
    const { listener } = await createListener();
    listener.onModuleDestroy();
    expect(runDispose).toHaveBeenCalledTimes(1);
    expect(chunkDispose).toHaveBeenCalledTimes(1);
    expect(terminalDispose).toHaveBeenCalledTimes(1);
  });
});
