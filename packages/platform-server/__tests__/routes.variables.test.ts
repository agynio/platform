import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { GraphVariablesController } from '../src/graph/controllers/graphVariables.controller';
import type { GraphRepository } from '../src/graph/graph.repository';
import type { PersistedGraph } from '../src/graph/types';

class InMemoryPrismaClient {
  variableLocal = {
    data: new Map<string, { key: string; value: string }>(),
    async findMany() { return Array.from(this.data.values()); },
    async upsert({ where, update, create }: any) {
      const key = where.key;
      const existing = this.data.get(key);
      if (existing) { this.data.set(key, { key, value: update.value }); return { key, value: update.value }; }
      this.data.set(key, { key, value: create.value });
      return { key, value: create.value };
    },
    async delete({ where }: any) { this.data.delete(where.key); return {}; },
  } as any;
}

class PrismaStub { client = new InMemoryPrismaClient() as any; getClient(): any { return this.client; } }

class GraphRepoStub implements GraphRepository {
  private snapshot: PersistedGraph = { name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] };
  async initIfNeeded(): Promise<void> {}
  async get(name: string): Promise<PersistedGraph | null> { return name === 'main' ? this.snapshot : null; }
  async upsert(req: any): Promise<PersistedGraph> {
    if (req.version !== this.snapshot.version) {
      const err: any = new Error('Version conflict'); err.code = 'VERSION_CONFLICT'; err.current = this.snapshot; throw err;
    }
    this.snapshot = { name: 'main', version: this.snapshot.version + 1, updatedAt: new Date().toISOString(), nodes: req.nodes, edges: req.edges, variables: req.variables };
    return this.snapshot;
  }
  async upsertNodeState(): Promise<void> {}
}

describe('GraphVariablesController routes', () => {
  let fastify: any; let prismaSvc: PrismaStub; let repo: GraphRepoStub; let controller: GraphVariablesController;
  beforeEach(async () => {
    fastify = Fastify({ logger: false }); prismaSvc = new PrismaStub(); repo = new GraphRepoStub();
    (repo as any).snapshot.variables = [ { key: 'A', value: 'GA' }, { key: 'B', value: 'GB' } ];
    prismaSvc.client.variableLocal.data.set('B', { key: 'B', value: 'LB' }); prismaSvc.client.variableLocal.data.set('C', { key: 'C', value: 'LC' });
    controller = new GraphVariablesController(repo as unknown as GraphRepository, prismaSvc as any);
    fastify.get('/api/graph/variables', async (_req, res) => res.send(await controller.list()));
    fastify.post('/api/graph/variables', async (req, res) => { try { const body = await controller.create(req.body); return res.send(body); } catch (e) { const status = (e as any)?.status || 400; return res.status(status).send({ error: (e as any)?.response?.error || 'error' }); } });
    fastify.put('/api/graph/variables/:key', async (req, res) => { const p = req.params as any; const b = req.body as any; try { const body = await controller.update(p.key, b); return res.send(body); } catch (e) { const status = (e as any)?.status || 400; return res.status(status).send({ error: (e as any)?.response?.error || 'error' }); } });
    fastify.delete('/api/graph/variables/:key', async (req, res) => { const p = req.params as any; try { await controller.remove(p.key); return res.status(204).send(); } catch (e) { const status = (e as any)?.status || 400; return res.status(status).send({ error: (e as any)?.response?.error || 'error' }); } });
  });

  it('aggregates graph and local overrides', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/graph/variables' }); expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ key: string; graph: string | null; local: string | null }>;
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey['A'].graph).toBe('GA'); expect(byKey['A'].local).toBe(null);
    expect(byKey['B'].graph).toBe('GB'); expect(byKey['B'].local).toBe('LB');
    expect(byKey['C'].graph).toBe(null); expect(byKey['C'].local).toBe('LC');
  });

  it('creates new variable and enforces unique key', async () => {
    const res = await fastify.inject({ method: 'POST', url: '/api/graph/variables', payload: { key: 'D', graph: 'GD' } }); expect(res.statusCode).toBe(201);
    const resDup = await fastify.inject({ method: 'POST', url: '/api/graph/variables', payload: { key: 'A', graph: 'X' } }); expect(resDup.statusCode).toBe(409);
  });

  it('updates graph and local values; deletes local on empty', async () => {
    const res = await fastify.inject({ method: 'PUT', url: '/api/graph/variables/B', payload: { graph: 'GB2' } }); expect(res.statusCode).toBe(200);
    const res2 = await fastify.inject({ method: 'PUT', url: '/api/graph/variables/A', payload: { local: 'LA' } }); expect(res2.statusCode).toBe(200);
    const res3 = await fastify.inject({ method: 'PUT', url: '/api/graph/variables/B', payload: { local: '' } }); expect(res3.statusCode).toBe(200);
    const resList = await fastify.inject({ method: 'GET', url: '/api/graph/variables' }); const items = resList.json().items as Array<{ key: string; graph: string | null; local: string | null }>;
    const byKey = Object.fromEntries(items.map((i) => [i.key, i])); expect(byKey['B'].graph).toBe('GB2'); expect(byKey['B'].local).toBe(null); expect(byKey['A'].local).toBe('LA');
  });

  it('deletes variable from graph and local override', async () => {
    await fastify.inject({ method: 'PUT', url: '/api/graph/variables/C', payload: { local: 'LC2' } });
    const resDel = await fastify.inject({ method: 'DELETE', url: '/api/graph/variables/C' }); expect(resDel.statusCode).toBe(204);
    const resList = await fastify.inject({ method: 'GET', url: '/api/graph/variables' });
    const items = resList.json().items as Array<{ key: string }>[]; expect(items.find((i: any) => i.key === 'C')).toBeUndefined();
  });
});

