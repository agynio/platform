import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { RemindMeFunctionTool } from '../src/graph/nodes/tools/remind_me/remind_me.tool';
import { RemindersController } from '../src/graph/nodes/tools/remind_me/reminders.controller';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { Signal } from '../src/signal';
// Use minimal callerAgent stub matching LLMContext requirements to avoid heavy DI
import { LoggerService } from '../src/core/services/logger.service';

describe('GET /graph/nodes/:nodeId/reminders', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllTimers(); vi.restoreAllMocks(); });

  it('returns active reminders for RemindMe tool node', async () => {
    const fastify = Fastify({ logger: false });
    const logger = new LoggerService();
    const prismaStub = {
      getClient() {
        return {
          reminder: {
          create: vi.fn(async (args: any) => ({ ...args.data, createdAt: new Date() })),
            update: vi.fn(async () => ({})),
          },
        } as any;
      },
    };
    const tool = new RemindMeFunctionTool(logger, prismaStub as any);
    const caller_agent = { invoke: vi.fn(async () => undefined), getAgentNodeId: () => 'agent' };
    await tool.execute({ delayMs: 10_000, note: 'Soon' }, { threadId: 't-1', callerAgent: caller_agent, finishSignal: new Signal() });

    // schedule a far reminder so it stays active
    // scheduled above via execute

    class RuntimeStub {
      getNodeInstance(id: string): unknown {
        return id === 'node-rem' ? tool : undefined;
      }
    }
    const runtime = new RuntimeStub() as LiveGraphRuntime;
    const controller = new RemindersController(logger, runtime);
    fastify.get('/graph/nodes/:nodeId/reminders', async (req, res) => {
      const p = req.params as { nodeId: string };
      const q = req.query as { limit?: string };
      const body = await controller.getReminders(p.nodeId, q.limit);
      return res.send(body);
    });

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
    class RuntimeStubMissing { getNodeInstance(_: string) { return undefined; } }
    const controller = new RemindersController(logger, new RuntimeStubMissing() as LiveGraphRuntime);
    fastify.get('/graph/nodes/:nodeId/reminders', async (req, res) => {
      const p = req.params as { nodeId: string };
      try {
        const body = await controller.getReminders(p.nodeId);
        return res.send(body);
      } catch (e) {
        const status = (e as { status?: number }).status || 404;
        return res.status(status).send({ error: 'node_not_found' });
      }
    });
    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/missing/reminders' });
    expect(res.statusCode).toBe(404);
    await fastify.close();
  });

  it('404 when node exists but is not RemindMe', async () => {
    const fastify = Fastify({ logger: false });
    const logger = new LoggerService();
    class RuntimeStubNotRem { getNodeInstance(_: string) { return {}; } }
    const controller = new RemindersController(logger, new RuntimeStubNotRem() as LiveGraphRuntime);
    fastify.get('/graph/nodes/:nodeId/reminders', async (req, res) => {
      const p = req.params as { nodeId: string };
      try {
        const body = await controller.getReminders(p.nodeId);
        return res.send(body);
      } catch (e) {
        const status = (e as { status?: number }).status || 404;
        return res.status(status).send({ error: 'not_remindme_node' });
      }
    });
    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/n/reminders' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error', 'not_remindme_node');
    await fastify.close();
  });
});
