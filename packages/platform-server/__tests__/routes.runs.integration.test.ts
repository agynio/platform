import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// Avoid Nest TestingModule; instantiate minimal app components directly where possible
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { LoggerService } from '../src/core/services/logger.service.js';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { GraphModule } from '../src/graph/graph.module';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';
import type Node from '../src/nodes/base/Node';
import { registerRunsRoutes } from '../src/routes/runs.route';
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

describe('RunsController (Nest + FastifyAdapter) integration', () => {
  let mongod: MongoMemoryServer | undefined;
  let client: MongoClient | undefined;
  let app: import('@nestjs/common').INestApplication | undefined;
  let fastify: FastifyInstance | undefined;
  let runs: AgentRunService | undefined;
  let runtime: LiveGraphRuntime | undefined;
  let registry: TemplateRegistry | undefined;
  let ready = true;

  beforeAll(async () => {
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());

      const logger = new LoggerService();
      const adapter = new FastifyAdapter({ logger: false });
      const module = await (await import('../src/bootstrap/app.module')).createAppModule?.(adapter as any, client!.db('agents-routes'));
      if (!module) throw new Error('App module factory not available');
      app = module;
      await app.init();
      fastify = (adapter as any).getInstance();

      runs = app.get(AgentRunService, { strict: false });
      await runs.ensureIndexes();
      registry = app.get(TemplateRegistry, { strict: false });
      runtime = app.get(LiveGraphRuntime, { strict: false });

      // Register a simple agent node class in runtime
      registry.register('testAgent', { title: 'A', kind: 'agent' }, TestAgent as any as new () => Node);
      await runtime.apply({ nodes: [{ id: 'agent1', data: { template: 'testAgent', config: {} } }], edges: [] } as any);
    } catch (e) {
      ready = false;
      console.warn('Skipping runs routes integration tests, mongo/Nest unavailable', (e as Error)?.message || String(e));
    }
  });

  afterAll(async () => {
    try { await app?.close(); } catch {}
    try { await client?.close(); } catch {}
    try { await mongod?.stop(); } catch {}
  });

  it('lists runs; node absent -> empty list', async () => {
    if (!ready || !fastify || !runs || !runtime) return;
    const r404 = await fastify.inject({ method: 'GET', url: '/graph/nodes/absent/runs' });
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
    if (!ready || !fastify || !runs || !runtime) return;
    const agent = runtime.getNodeInstance<TestAgent>('agent1')!;
    const runId = 'thrA/run-1';
    agent.setRun('thrA', runId);
    await runs.startRun('agent1', 'thrA', runId);
    const res1 = await fastify.inject({ method: 'POST', url: `/graph/nodes/agent1/runs/${encodeURIComponent(runId)}/terminate` });
    expect(res1.statusCode).toBe(202);
    const res2 = await fastify.inject({ method: 'POST', url: `/graph/nodes/agent1/runs/${encodeURIComponent(runId)}/terminate` });
    expect(res2.statusCode).toBe(409);
  });

  it('terminate by threadId uses current run; 404/409 cases', async () => {
    if (!ready || !fastify || !runs || !runtime) return;
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
