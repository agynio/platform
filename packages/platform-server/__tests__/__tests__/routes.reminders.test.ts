import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerRemindersRoute } from '../routes/reminders.route';
import { RemindMeTool } from '../nodes/tools/remind_me.tool';
import { LoggerService } from '../core/services/logger.service';

describe('GET /graph/nodes/:nodeId/reminders', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllTimers(); vi.restoreAllMocks(); });

  it('returns active reminders for RemindMe tool node', async () => {
    const fastify = Fastify({ logger: false });
    const logger = new LoggerService();
    const tool = new RemindMeTool(logger);
    const dyn = tool.init();

    // schedule a far reminder so it stays active
    const caller_agent = { invoke: vi.fn(async () => undefined) } as any;
    await dyn.invoke({ delayMs: 10_000, note: 'Soon' }, { configurable: { thread_id: 't-1', caller_agent } });

    const runtime = { getNodeInstance: (id: string) => (id === 'node-rem' ? (tool as unknown) : undefined) } as any;
    registerRemindersRoute(fastify as any, runtime, logger);

    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/node-rem/reminders' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ note: string; threadId: string; at: string }> };
    expect(body.items.length).toBe(1);
    expect(body.items[0].note).toBe('Soon');
    expect(body.items[0].threadId).toBe('t-1');

    // after firing, the registry should be empty
    await vi.advanceTimersByTimeAsync(10_000);
    const res2 = await fastify.inject({ method: 'GET', url: '/graph/nodes/node-rem/reminders' });
    const body2 = res2.json() as { items: any[] };
    expect(body2.items.length).toBe(0);
    await fastify.close();
  });

  it('404 when node missing or not RemindMe', async () => {
    const fastify = Fastify({ logger: false });
    const logger = new LoggerService();
    const runtime = { getNodeInstance: (_: string) => undefined } as any;
    registerRemindersRoute(fastify as any, runtime, logger);
    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/missing/reminders' });
    expect(res.statusCode).toBe(404);
    await fastify.close();
  });

  it('404 when node exists but is not RemindMe', async () => {
    const fastify = Fastify({ logger: false });
    const logger = new LoggerService();
    const runtime = { getNodeInstance: (_: string) => ({}) } as any;
    registerRemindersRoute(fastify as any, runtime, logger);
    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/n/reminders' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error', 'not_remindme_node');
    await fastify.close();
  });
});
