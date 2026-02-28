import { describe, it, expect, vi } from 'vitest';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

describe('GraphSocketGateway metrics coalescing', () => {
  it('coalesces multiple schedules into single batch computation', async () => {
    vi.useFakeTimers();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    // Stub metrics service to capture calls
    const getThreadsMetrics = vi.fn(async (_ids: string[]) =>
      Object.fromEntries(_ids.map((id) => [id, { remindersCount: 0, containersCount: 0, activity: 'idle' as const }])),
    );
    const metricsStub = { getThreadsMetrics } as any;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as any;
    const eventsBusStub = {
      subscribeToRunEvents: () => () => {},
      subscribeToToolOutputChunk: () => () => {},
      subscribeToToolOutputTerminal: () => () => {},
      subscribeToReminderCount: () => () => {},
      subscribeToNodeState: () => () => {},
      subscribeToThreadCreated: () => () => {},
      subscribeToThreadUpdated: () => () => {},
      subscribeToMessageCreated: () => () => {},
      subscribeToRunStatusChanged: () => () => {},
      subscribeToThreadMetrics: () => () => {},
      subscribeToThreadMetricsAncestors: () => () => {},
    };
    const notificationsPublisher = { publishToRooms: vi.fn().mockResolvedValue(undefined) };
    const gateway = new GraphSocketGateway(
      runtimeStub,
      metricsStub,
      prismaStub,
      eventsBusStub as any,
      notificationsPublisher,
    );
    gateway.onModuleInit();

    gateway.scheduleThreadMetrics('t1');
    gateway.scheduleThreadMetrics('t2');
    // Advance timers to trigger flush
    vi.advanceTimersByTime(120);
    await Promise.resolve();

    // Assert single batch computation and grouped emits to both rooms
    expect(getThreadsMetrics).toHaveBeenCalledTimes(1);
    expect(getThreadsMetrics).toHaveBeenCalledWith(['t1', 't2']);
    const activityCalls = notificationsPublisher.publishToRooms.mock.calls.filter((call) => call[0].event === 'thread_activity_changed');
    const remindersCalls = notificationsPublisher.publishToRooms.mock.calls.filter((call) => call[0].event === 'thread_reminders_count');
    expect(activityCalls.map((call) => call[0].payload.threadId).sort()).toEqual(['t1', 't2']);
    expect(remindersCalls.map((call) => call[0].payload.threadId).sort()).toEqual(['t1', 't2']);
    vi.useRealTimers();
  });
});
