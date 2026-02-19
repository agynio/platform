import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EventsBusService,
  ReminderCountEvent,
  RunEventBusPayload,
} from '../src/events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { NotificationsPublisher } from '../src/notifications/notifications.publisher';

type Handler<T> = ((payload: T) => void) | null;

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const THREAD_ID = '00000000-0000-4000-8000-000000000002';
const EVENT_ID = '00000000-0000-4000-8000-000000000003';
const MESSAGE_ID = '00000000-0000-4000-8000-000000000004';

type PublisherTestContext = {
  publisher: NotificationsPublisher;
  handlers: {
    run: Handler<RunEventBusPayload>;
    chunk: Handler<ToolOutputChunkPayload>;
    terminal: Handler<ToolOutputTerminalPayload>;
    reminder: Handler<ReminderCountEvent>;
    nodeState: Handler<{ nodeId: string; state: Record<string, unknown>; updatedAtMs?: number }>;
    threadCreated: Handler<{ id: string }>;
    threadUpdated: Handler<{ id: string }>;
    messageCreated: Handler<{ threadId: string; message: { id: string; kind: string; createdAt: Date } }>;
    runStatus: Handler<{ threadId: string; run: { id: string; status: string; createdAt: Date; updatedAt: Date } }>;
    threadMetrics: Handler<{ threadId: string }>;
    threadMetricsAncestors: Handler<{ threadId: string }>;
  };
  broker: { publish: ReturnType<typeof vi.fn> };
  logger: { warn: ReturnType<typeof vi.fn> };
};

async function createPublisherTestContext(): Promise<PublisherTestContext> {
  const handlers: PublisherTestContext['handlers'] = {
    run: null,
    chunk: null,
    terminal: null,
    reminder: null,
    nodeState: null,
    threadCreated: null,
    threadUpdated: null,
    messageCreated: null,
    runStatus: null,
    threadMetrics: null,
    threadMetricsAncestors: null,
  };
  const disposers = Object.fromEntries(
    Object.keys(handlers).map((key) => [key, vi.fn(() => undefined)]),
  ) as Record<string, ReturnType<typeof vi.fn>>;

  const eventsBus: Pick<
    EventsBusService,
    | 'subscribeToRunEvents'
    | 'subscribeToToolOutputChunk'
    | 'subscribeToToolOutputTerminal'
    | 'subscribeToReminderCount'
    | 'subscribeToNodeState'
    | 'subscribeToThreadCreated'
    | 'subscribeToThreadUpdated'
    | 'subscribeToMessageCreated'
    | 'subscribeToRunStatusChanged'
    | 'subscribeToThreadMetrics'
    | 'subscribeToThreadMetricsAncestors'
  > = {
    subscribeToRunEvents: (listener) => {
      handlers.run = listener;
      return disposers.run;
    },
    subscribeToToolOutputChunk: (listener) => {
      handlers.chunk = listener;
      return disposers.chunk;
    },
    subscribeToToolOutputTerminal: (listener) => {
      handlers.terminal = listener;
      return disposers.terminal;
    },
    subscribeToReminderCount: (listener) => {
      handlers.reminder = listener;
      return disposers.reminder;
    },
    subscribeToNodeState: (listener) => {
      handlers.nodeState = listener;
      return disposers.nodeState;
    },
    subscribeToThreadCreated: (listener) => {
      handlers.threadCreated = listener;
      return disposers.threadCreated;
    },
    subscribeToThreadUpdated: (listener) => {
      handlers.threadUpdated = listener;
      return disposers.threadUpdated;
    },
    subscribeToMessageCreated: (listener) => {
      handlers.messageCreated = listener;
      return disposers.messageCreated;
    },
    subscribeToRunStatusChanged: (listener) => {
      handlers.runStatus = listener;
      return disposers.runStatus;
    },
    subscribeToThreadMetrics: (listener) => {
      handlers.threadMetrics = listener;
      return disposers.threadMetrics;
    },
    subscribeToThreadMetricsAncestors: (listener) => {
      handlers.threadMetricsAncestors = listener;
      return disposers.threadMetricsAncestors;
    },
  };

  const runtime = { subscribe: vi.fn().mockReturnValue(() => undefined) } as any;
  const metrics = { getThreadsMetrics: vi.fn().mockResolvedValue({}) } as any;
  const prisma = { getClient: vi.fn().mockReturnValue({ $queryRaw: vi.fn().mockResolvedValue([]) }) } as any;
  const broker = {
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const publisher = new NotificationsPublisher(runtime, metrics, prisma, eventsBus as EventsBusService, broker as any);
  const internalLogger = (publisher as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger;
  const logger = {
    warn: vi.spyOn(internalLogger, 'warn').mockImplementation(() => undefined),
  };
  await publisher.onModuleInit();

  return { publisher, handlers, broker, logger };
}

describe('NotificationsPublisher event bus integration', () => {
  let ctx: PublisherTestContext;

  beforeEach(async () => {
    ctx = await createPublisherTestContext();
  });

  afterEach(async () => {
    await ctx.publisher.onModuleDestroy();
  });

  it('publishes run events for bus payloads', () => {
    ctx.handlers.run?.({
      eventId: EVENT_ID,
      mutation: 'append',
      event: {
        id: EVENT_ID,
        runId: RUN_ID,
        threadId: THREAD_ID,
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

    expect(ctx.broker.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'run_event_appended',
        rooms: expect.arrayContaining([`run:${RUN_ID}`, `thread:${THREAD_ID}`]),
      }),
    );
  });

  it('converts tool output chunk timestamps to ISO strings', () => {
    ctx.handlers.chunk?.({
      runId: RUN_ID,
      threadId: THREAD_ID,
      eventId: EVENT_ID,
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: '2025-01-01T00:00:00.000Z',
      data: 'chunk',
    });

    const envelope = ctx.broker.publish.mock.calls.find(([call]) => (call as { event: string }).event === 'tool_output_chunk')?.[0];
    expect(envelope).toBeDefined();
    expect((envelope as { payload: { ts: string } }).payload.ts).toBe('2025-01-01T00:00:00.000Z');
  });

  it('logs and skips invalid chunk timestamps', () => {
    ctx.handlers.chunk?.({
      runId: RUN_ID,
      threadId: THREAD_ID,
      eventId: EVENT_ID,
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: 'invalid',
      data: 'chunk',
    } as any);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('NotificationsPublisher received invalid chunk timestamp'),
    );
  });

  it('publishes reminder counts and schedules thread metrics', () => {
    ctx.handlers.reminder?.({ nodeId: 'node-1', count: 2, threadId: THREAD_ID, updatedAtMs: 10 } as ReminderCountEvent);
    expect(ctx.logger.warn).not.toHaveBeenCalled();
    expect(ctx.broker.publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'node_reminder_count' }));
  });

  it('publishes node state updates', () => {
    ctx.handlers.nodeState?.({ nodeId: 'node-1', state: { foo: 'bar' }, updatedAtMs: 5 });
    expect(ctx.broker.publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'node_state' }));
  });

  it('publishes message created events', () => {
    ctx.handlers.messageCreated?.({
      threadId: THREAD_ID,
      message: {
        id: MESSAGE_ID,
        kind: 'user',
        text: 'hello',
        source: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      } as any,
    });
    expect(ctx.broker.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'message_created', rooms: expect.arrayContaining([`thread:${THREAD_ID}`]) }),
    );
  });

  it('publishes run status updates', () => {
    ctx.handlers.runStatus?.({
      threadId: THREAD_ID,
      run: {
        id: RUN_ID,
        status: 'running',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:01:00.000Z'),
      },
    } as any);
    expect(ctx.broker.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'run_status_changed',
        rooms: expect.arrayContaining([`thread:${THREAD_ID}`, `run:${RUN_ID}`]),
      }),
    );
  });
});
