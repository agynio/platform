import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventsBusService, ReminderCountEvent, RunEventBusPayload } from '../src/events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

type Handler<T> = ((payload: T) => void) | null;

type GatewayTestContext = {
  gateway: GraphSocketGateway;
  handlers: {
    run: Handler<RunEventBusPayload>;
    chunk: Handler<ToolOutputChunkPayload>;
    terminal: Handler<ToolOutputTerminalPayload>;
    reminder: Handler<ReminderCountEvent>;
    nodeState: Handler<{ nodeId: string; state: Record<string, unknown>; updatedAtMs?: number }>;
    threadCreated: Handler<{ id: string }>;
    threadUpdated: Handler<{ id: string }>;
    messageCreated: Handler<{ threadId: string; message: { id: string } }>;
    runStatus: Handler<{ threadId: string; run: { id: string; status: string; createdAt: Date; updatedAt: Date } }>;
    threadMetrics: Handler<{ threadId: string }>;
    threadMetricsAncestors: Handler<{ threadId: string }>;
  };
  disposers: Record<string, ReturnType<typeof vi.fn>>;
  logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
};

function createGatewayTestContext(): GatewayTestContext {
  const handlers: GatewayTestContext['handlers'] = {
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
  const disposers: GatewayTestContext['disposers'] = {
    run: vi.fn(),
    chunk: vi.fn(),
    terminal: vi.fn(),
    reminder: vi.fn(),
    nodeState: vi.fn(),
    threadCreated: vi.fn(),
    threadUpdated: vi.fn(),
    messageCreated: vi.fn(),
    runStatus: vi.fn(),
    threadMetrics: vi.fn(),
    threadMetricsAncestors: vi.fn(),
  };

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

  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  const runtime = { subscribe: vi.fn() } as any;
  const metrics = { getThreadsMetrics: vi.fn().mockResolvedValue({}) } as any;
  const prisma = { getClient: vi.fn().mockReturnValue({ $queryRaw: vi.fn().mockResolvedValue([]) }) } as any;

  const gateway = new GraphSocketGateway(logger as any, runtime, metrics, prisma, eventsBus as EventsBusService);
  gateway.onModuleInit();

  return { gateway, handlers, disposers, logger };
}

describe('GraphSocketGateway event bus integration', () => {
  let ctx: GatewayTestContext;

  beforeEach(() => {
    ctx = createGatewayTestContext();
  });

  it('emits run events for bus payloads', () => {
    const spy = vi.spyOn(ctx.gateway, 'emitRunEvent');
    ctx.handlers.run?.({
      eventId: 'evt-1',
      mutation: 'append',
      event: {
        id: 'evt-1',
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
    expect(spy).toHaveBeenCalledWith('run-1', 'thread-1', expect.objectContaining({ mutation: 'append' }));
  });

  it('converts tool output chunk timestamps to Date objects', () => {
    const spy = vi.spyOn(ctx.gateway, 'emitToolOutputChunk');
    ctx.handlers.chunk?.({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: '2025-01-01T00:00:00.000Z',
      data: 'chunk',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'event-1',
        ts: expect.any(Date),
      }),
    );
    const payload = spy.mock.calls[0]?.[0];
    expect(payload.ts.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('logs and skips invalid chunk timestamps', () => {
    const spy = vi.spyOn(ctx.gateway, 'emitToolOutputChunk');
    ctx.handlers.chunk?.({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      seqGlobal: 1,
      seqStream: 1,
      source: 'stdout',
      ts: 'invalid',
      data: 'chunk',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'GraphSocketGateway received invalid chunk timestamp',
      expect.objectContaining({ eventId: 'event-1', ts: 'invalid' }),
    );
  });

  it('emits tool output terminal payloads', () => {
    const spy = vi.spyOn(ctx.gateway, 'emitToolOutputTerminal');
    ctx.handlers.terminal?.({
      runId: 'run-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      exitCode: 0,
      status: 'success',
      bytesStdout: 10,
      bytesStderr: 0,
      totalChunks: 1,
      droppedChunks: 0,
      savedPath: null,
      message: null,
      ts: '2025-01-01T00:00:00.000Z',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'event-1',
        ts: expect.any(Date),
        status: 'success',
      }),
    );
  });

  it('bridges reminder_count events to metrics scheduling', () => {
    const reminderSpy = vi.spyOn(ctx.gateway, 'emitReminderCount');
    const scheduleAncestors = vi
      .spyOn(ctx.gateway, 'scheduleThreadAndAncestorsMetrics')
      .mockResolvedValue();
    ctx.handlers.reminder?.({ nodeId: 'node-1', count: 2, updatedAtMs: 123, threadId: 'thread-1' });
    expect(reminderSpy).toHaveBeenCalledWith('node-1', 2, 123);
    expect(scheduleAncestors).toHaveBeenCalledWith('thread-1');
  });

  it('forwards node_state events to emitNodeState', () => {
    const spy = vi.spyOn(ctx.gateway, 'emitNodeState');
    ctx.handlers.nodeState?.({ nodeId: 'node-1', state: { value: 1 }, updatedAtMs: 10 });
    expect(spy).toHaveBeenCalledWith('node-1', { value: 1 }, 10);
  });

  it('emits thread and message events', () => {
    const threadCreated = vi.spyOn(ctx.gateway, 'emitThreadCreated');
    const threadUpdated = vi.spyOn(ctx.gateway, 'emitThreadUpdated');
    const messageCreated = vi.spyOn(ctx.gateway, 'emitMessageCreated');
    const runStatus = vi.spyOn(ctx.gateway, 'emitRunStatusChanged');

    ctx.handlers.threadCreated?.({
      id: 'thread-1',
      alias: 't',
      summary: null,
      status: 'open',
      createdAt: new Date(),
      parentId: null,
      channelNodeId: null,
    } as any);
    ctx.handlers.threadUpdated?.({
      id: 'thread-2',
      alias: 't2',
      summary: null,
      status: 'open',
      createdAt: new Date(),
      parentId: null,
      channelNodeId: null,
    } as any);
    ctx.handlers.messageCreated?.({ threadId: 'thread-1', message: { id: 'msg-1', kind: 'user', text: 'hi', source: {}, createdAt: new Date() } as any });
    ctx.handlers.runStatus?.({ threadId: 'thread-1', run: { id: 'run-1', status: 'running', createdAt: new Date(), updatedAt: new Date() } });

    expect(threadCreated).toHaveBeenCalled();
    expect(threadUpdated).toHaveBeenCalled();
    expect(messageCreated).toHaveBeenCalledWith('thread-1', expect.objectContaining({ id: 'msg-1' }));
    expect(runStatus).toHaveBeenCalledWith('thread-1', expect.objectContaining({ id: 'run-1' }));
  });

  it('schedules metrics for thread_metrics events', () => {
    const schedule = vi.spyOn(ctx.gateway, 'scheduleThreadMetrics').mockImplementation(() => undefined);
    const scheduleAncestors = vi.spyOn(ctx.gateway, 'scheduleThreadAndAncestorsMetrics').mockResolvedValue();
    ctx.handlers.threadMetrics?.({ threadId: 'thread-1' });
    expect(schedule).toHaveBeenCalledWith('thread-1');
    ctx.handlers.threadMetricsAncestors?.({ threadId: 'thread-2' });
    expect(scheduleAncestors).toHaveBeenCalledWith('thread-2');
  });

  it('cleans up subscriptions on destroy', () => {
    ctx.gateway.onModuleDestroy();
    expect(ctx.disposers.run).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.chunk).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.terminal).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.reminder).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.nodeState).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.threadCreated).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.threadUpdated).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.messageCreated).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.runStatus).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.threadMetrics).toHaveBeenCalledTimes(1);
    expect(ctx.disposers.threadMetricsAncestors).toHaveBeenCalledTimes(1);
  });
});
