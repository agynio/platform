import { describe, it, expect, vi } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';

describe('GraphSocketGateway metrics coalescing', () => {
  it('coalesces multiple schedules into single batch computation', async () => {
    vi.useFakeTimers();
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    // Stub metrics service to capture calls
    const getThreadsMetrics = vi.fn(async (_ids: string[]) => Object.fromEntries(_ids.map((id) => [id, { remindersCount: 0, activity: 'idle' as const }])));
    const metricsStub = { getThreadsMetrics } as any;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as any;
    const gateway = new GraphSocketGateway(logger, runtimeStub, metricsStub, prismaStub as any);
    // Attach and stub io emit sink
    gateway.init({ server: fastify.server });
    const captured: Array<{ room: string; event: string; payload: any }> = [];
    (gateway as any)['io'] = { to: (room: string) => ({ emit: (event: string, payload: any) => { captured.push({ room, event, payload }); } }) };

    gateway.scheduleThreadMetrics('t1');
    gateway.scheduleThreadMetrics('t2');
    // Advance timers to trigger flush
    vi.advanceTimersByTime(120);
    await Promise.resolve();

    // Assert single batch computation and grouped emits to both rooms
    expect(getThreadsMetrics).toHaveBeenCalledTimes(1);
    expect(getThreadsMetrics).toHaveBeenCalledWith(['t1', 't2']);
    const activityThreadsRoom = captured.filter((e) => e.event === 'thread_activity_changed' && e.room === 'threads');
    const remindersThreadsRoom = captured.filter((e) => e.event === 'thread_reminders_count' && e.room === 'threads');
    expect(activityThreadsRoom.map((e) => e.payload.threadId).sort()).toEqual(['t1', 't2']);
    expect(remindersThreadsRoom.map((e) => e.payload.threadId).sort()).toEqual(['t1', 't2']);
    vi.useRealTimers();
  });
});
