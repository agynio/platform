import { describe, it, expect, vi } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { ConfigService } from '../src/core/services/config.service';
import type { AuthService } from '../src/auth/auth.service';

describe('GraphSocketGateway metrics coalescing', () => {
  it('coalesces multiple schedules into single batch computation', async () => {
    vi.useFakeTimers();
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    // Stub metrics service to capture calls
    const getThreadsMetrics = vi.fn(async (_ids: string[]) =>
      Object.fromEntries(_ids.map((id) => [id, { remindersCount: 0, containersCount: 0, activity: 'idle' as const }])),
    );
    const metricsStub = { getThreadsMetrics } as any;
    const prismaStub = {
      getClient: () => ({
        $queryRaw: async () => [],
        thread: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            if (where.id === 't1') return { ownerUserId: 'user-1' };
            if (where.id === 't2') return { ownerUserId: 'user-2' };
            return null;
          },
        },
      }),
    } as any;
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
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authStub = { resolvePrincipalFromCookieHeader: async () => ({ userId: 'test-user' }) } as unknown as AuthService;
    const gateway = new GraphSocketGateway(runtimeStub, metricsStub, prismaStub, eventsBusStub as any, configStub, authStub);
    // Attach and stub io emit sink
    gateway.init({ server: fastify.server });
    const ownerSpy = vi.spyOn(gateway as any, 'getThreadOwnerId').mockImplementation(async (threadId: string) => {
      if (threadId === 't1') return 'user-1';
      if (threadId === 't2') return 'user-2';
      return null;
    });
    const emitSpy = vi.spyOn(gateway as any, 'emitToUserRooms').mockImplementation(() => {});

    gateway.scheduleThreadMetrics('t1');
    gateway.scheduleThreadMetrics('t2');
    // Advance timers to trigger flush
    vi.advanceTimersByTime(120);
    await vi.runOnlyPendingTimersAsync();

    // Assert single batch computation and grouped emits to both rooms
    expect(getThreadsMetrics).toHaveBeenCalledTimes(1);
    expect(getThreadsMetrics).toHaveBeenCalledWith(['t1', 't2']);
    const activityThreads = emitSpy.mock.calls
      .filter(([, , event]) => event === 'thread_activity_changed')
      .map(([, , , payload]) => (payload as { threadId: string }).threadId)
      .sort();
    const remindersThreads = emitSpy.mock.calls
      .filter(([, , event]) => event === 'thread_reminders_count')
      .map(([, , , payload]) => (payload as { threadId: string }).threadId)
      .sort();
    expect(activityThreads).toEqual(['t1', 't2']);
    expect(remindersThreads).toEqual(['t1', 't2']);
    expect(ownerSpy.mock.calls.map((args) => args[0]).sort()).toEqual(['t1', 't2']);
    vi.useRealTimers();
  });
});
