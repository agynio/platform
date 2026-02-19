import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotificationEnvelope } from '@agyn/shared';
import { NotificationsPublisher } from '../src/notifications/notifications.publisher';

describe('NotificationsPublisher metrics coalescing', () => {
  const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
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
  } as any;

  let metricsStub: { getThreadsMetrics: ReturnType<typeof vi.fn> };
  let brokerStub: { connect: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let publisher: NotificationsPublisher;

  beforeEach(() => {
    metricsStub = {
      getThreadsMetrics: vi.fn(async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { remindersCount: 0, activity: 'idle' as const }])),
      ),
    };
    brokerStub = {
      connect: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    publisher = new NotificationsPublisher(runtimeStub, metricsStub as any, prismaStub, eventsBusStub, brokerStub as any);
  });

  it('coalesces multiple schedules into single batch computation', async () => {
    vi.useFakeTimers();
    publisher.scheduleThreadMetrics('t1');
    publisher.scheduleThreadMetrics('t2');

    await vi.advanceTimersByTimeAsync(120);
    await Promise.resolve();

    expect(metricsStub.getThreadsMetrics).toHaveBeenCalledTimes(1);
    expect(metricsStub.getThreadsMetrics).toHaveBeenCalledWith(['t1', 't2']);
    const envelopes = brokerStub.publish.mock.calls.map(([envelope]) => envelope as NotificationEnvelope);
    const activityPayloads = envelopes.filter((e) => e.event === 'thread_activity_changed');
    const remindersPayloads = envelopes.filter((e) => e.event === 'thread_reminders_count');
    expect(activityPayloads.map((e) => e.payload.threadId).sort()).toEqual(['t1', 't2']);
    expect(remindersPayloads.map((e) => e.payload.threadId).sort()).toEqual(['t1', 't2']);
    vi.useRealTimers();
  });
});
