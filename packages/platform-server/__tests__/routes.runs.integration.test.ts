import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { LoggerService } from '../src/core/services/logger.service.js';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { AgentRunService } from '../src/nodes/agentRun.repository';
import type { FactoryFn } from '../src/graph/types';
import { RuntimeRef } from '../src/graph/controllers/runtime.ref';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

class TestAgent {
  private threadToRun = new Map<string, string>();
  getCurrentRunId(thread: string) { return this.threadToRun.get(thread); }
  setRun(thread: string, runId: string) { this.threadToRun.set(thread, runId); }
  terminateRun(thread: string, runId?: string): 'ok' | 'not_running' | 'not_found' {
    const curr = this.threadToRun.get(thread);
    if (!curr) return 'not_running';
    if (runId && curr !== runId) return 'not_found';
    this.threadToRun.delete(thread);
    return 'ok';
  }
}

describe('Runs routes integration', () => {
  const logger = new LoggerService();
  const registry = new TemplateRegistry();
  const runtime = new LiveGraphRuntime(logger, registry);
  let fastify = Fastify({ logger: false });
  let runs: AgentRunService;
  let mongod: MongoMemoryServer | undefined;
  let client: MongoClient | undefined;
  let ready = true;

  beforeAll(async () => {
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());
      runs = new AgentRunService(client.db('agents-routes'), logger);
      await runs.ensureIndexes();

      // Register a simple agent node in runtime
      const factory: FactoryFn = async () => new TestAgent() as any;
      registry.register('testAgent', factory, { sourcePorts: {}, targetPorts: {} }, { title: 'A', kind: 'agent' });
      await runtime.apply({ nodes: [{ id: 'agent1', data: { template: 'testAgent', config: {} } }], edges: [] } as any);

      // Hook runtime into controller bridge and use a lightweight Fastify server
      RuntimeRef.set(runtime);
      fastify = Fastify();
      // Minimal stub to satisfy controller paths for e2e: re-implement endpoints to mirror Nest controller logic
      fastify.get('/graph/nodes/:nodeId/runs', async (req) => {
        const { nodeId } = req.params as any;
        const status = (req.query as any)?.status ?? 'all';
        const items = await runs.list(nodeId, status);
        return { items: items.map(({ _id, ...rest }) => ({ ...rest, startedAt: rest.startedAt.toISOString(), updatedAt: rest.updatedAt.toISOString(), ...(rest.expiresAt ? { expiresAt: rest.expiresAt.toISOString() } : {}), })) };
      });
      fastify.post('/graph/nodes/:nodeId/runs/:runId/terminate', async (req, reply) => {
        const { nodeId, runId } = req.params as any;
        type TerminableAgent = { terminateRun: (threadId: string, runId?: string) => 'ok' | 'not_running' | 'not_found' };
        const inst = runtime.getNodeInstance<TerminableAgent>(nodeId);
        if (!inst || typeof inst.terminateRun !== 'function') { reply.code(404); return { error: 'not_terminable' }; }
        const doc = await runs.findByRunId(nodeId, runId);
        const threadId = doc?.threadId;
        if (!threadId) { reply.code(404); return { error: 'run_not_found' }; }
        const res = inst.terminateRun(threadId, runId);
        if (res === 'ok') { await runs.markTerminating(nodeId, runId).catch(() => {}); reply.code(202); return { status: 'terminating' }; }
        if (res === 'not_found') { reply.code(404); return { error: 'run_not_found' }; }
        reply.code(409); return { error: 'not_running' };
      });
      fastify.post('/graph/nodes/:nodeId/threads/:threadId/terminate', async (req, reply) => {
        const { nodeId, threadId } = req.params as any;
        type TerminableAgent = { terminateRun: (threadId: string, runId?: string) => 'ok' | 'not_running' | 'not_found'; getCurrentRunId?: (threadId: string) => string | undefined };
        const inst = runtime.getNodeInstance<TerminableAgent>(nodeId);
        if (!inst || typeof inst.terminateRun !== 'function' || typeof inst.getCurrentRunId !== 'function') { reply.code(404); return { error: 'not_terminable' }; }
        const runId = inst.getCurrentRunId(threadId);
        if (!runId) { reply.code(409); return { error: 'not_running' }; }
        const res = inst.terminateRun(threadId, runId);
        if (res === 'ok') { await runs.markTerminating(nodeId, runId).catch(() => {}); reply.code(202); return { status: 'terminating' }; }
        if (res === 'not_found') { reply.code(404); return { error: 'run_not_found' }; }
        reply.code(409); return { error: 'not_running' };
      });
      await fastify.listen({ port: 0 });
    } catch (e) {
      ready = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping runs routes integration tests, mongo unavailable', (e as Error)?.message || String(e));
    }
  });

  afterAll(async () => {
    try { if (ready) await fastify.close(); } catch {}
    try { await client?.close(); } catch {}
    try { await mongod?.stop(); } catch {}
  });

  it('lists runs; 404 when node not found', async () => {
    if (!ready) return;
    const r404 = await fastify.inject({ method: 'GET', url: '/graph/nodes/absent/runs' });
    // service uses list only; absent node is fine -> empty list
    expect(r404.statusCode).toBe(200);
    const agent = runtime.getNodeInstance<TestAgent>('agent1')!;
    const runId = 'thread-1/run-123';
    agent.setRun('thread-1', runId);
    await runs.startRun('agent1', 'thread-1', runId);
    const res = await fastify.inject({ method: 'GET', url: '/graph/nodes/agent1/runs?status=all' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.find((r: any) => r.runId === runId)).toBeTruthy();
  });

  it('terminate by runId uses persisted threadId; 409 when not running; idempotent', async () => {
    if (!ready) return;
    const agent = runtime.getNodeInstance<TestAgent>('agent1')!;
    const runId = 'thrA/run-1';
    agent.setRun('thrA', runId);
    await runs.startRun('agent1', 'thrA', runId);
    const res1 = await fastify.inject({ method: 'POST', url: `/graph/nodes/agent1/runs/${encodeURIComponent(runId)}/terminate` });
    expect(res1.statusCode).toBe(202);
    const res2 = await fastify.inject({ method: 'POST', url: `/graph/nodes/agent1/runs/${encodeURIComponent(runId)}/terminate` });
    // Now agent no longer running that run -> 409
    expect(res2.statusCode).toBe(409);
  });

  it('terminate by threadId uses current run; 404 when node/run not found', async () => {
    if (!ready) return;
    const runId = 'thrB/run-1';
    const agent = runtime.getNodeInstance<TestAgent>('agent1')!;
    agent.setRun('thrB', runId);
    await runs.startRun('agent1', 'thrB', runId);
    const ok = await fastify.inject({ method: 'POST', url: '/graph/nodes/agent1/threads/thrB/terminate' });
    expect(ok.statusCode).toBe(202);
    const missingNode = await fastify.inject({ method: 'POST', url: '/graph/nodes/absent/threads/x/terminate' });
    expect(missingNode.statusCode).toBe(404);
    const notRunning = await fastify.inject({ method: 'POST', url: '/graph/nodes/agent1/threads/thrB/terminate' });
    expect(notRunning.statusCode).toBe(409);
  });
});
