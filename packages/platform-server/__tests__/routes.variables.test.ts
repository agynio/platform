import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { GraphVariablesController } from '../src/graph/controllers/graphVariables.controller';
import { GraphVariablesService } from '../src/graph/services/graphVariables.service';

class InMemoryPrismaClient {
  graphVariable = {
    data: new Map<string, { key: string; value: string }>(),
    async findMany() { return Array.from(this.data.values()); },
    async findUnique(args: { where: { key: string } }) { return this.data.get(args.where.key) ?? null; },
    async create(args: { data: { key: string; value: string } }) {
      const { key, value } = args.data;
      this.data.set(key, { key, value });
      return { key, value };
    },
    async update(args: { where: { key: string }; data: { value: string } }) {
      const key = args.where.key;
      if (!this.data.has(key)) throw new Error('not_found');
      const value = args.data.value;
      this.data.set(key, { key, value });
      return { key, value };
    },
    async deleteMany(args: { where: { key: string } }) {
      const existed = this.data.delete(args.where.key);
      return { count: existed ? 1 : 0 };
    },
  };
  variableLocal = {
    data: new Map<string, { key: string; value: string }>(),
    async findMany() { return Array.from(this.data.values()); },
    async findUnique(args: { where: { key: string } }) { return this.data.get(args.where.key) ?? null; },
    async upsert(args: { where: { key: string }; update: { value: string }; create: { key: string; value: string } }) {
      const key = args.where.key;
      const existing = this.data.get(key);
      if (existing) { this.data.set(key, { key, value: args.update.value }); return { key, value: args.update.value }; }
      this.data.set(key, { key, value: args.create.value });
      return { key, value: args.create.value };
    },
    async delete(args: { where: { key: string } }) { this.data.delete(args.where.key); return {}; },
    async deleteMany(args: { where: { key: string } }) { const existed = this.data.delete(args.where.key); return { count: existed ? 1 : 0 }; },
  };
}

class PrismaStub { client = new InMemoryPrismaClient(); getClient() { return this.client as unknown as any; } }

describe('GraphVariablesController routes', () => {
  let fastify: any; let prismaSvc: PrismaStub; let controller: GraphVariablesController;
  beforeEach(async () => {
    fastify = Fastify({ logger: false }); prismaSvc = new PrismaStub();
    prismaSvc.client.graphVariable.data.set('A', { key: 'A', value: 'GA' });
    prismaSvc.client.graphVariable.data.set('B', { key: 'B', value: 'GB' });
    prismaSvc.client.variableLocal.data.set('B', { key: 'B', value: 'LB' }); prismaSvc.client.variableLocal.data.set('C', { key: 'C', value: 'LC' });
    const service = new GraphVariablesService(prismaSvc as any);
    controller = new GraphVariablesController(service);
    fastify.get('/api/graph/variables', async (_req, res) => res.send(await controller.list()));
    // POST should return 201 like Nest's @HttpCode(201)
    fastify.post('/api/graph/variables', async (req, res) => {
      try {
        const body = await controller.create(req.body);
        return res.status(201).send(body);
      } catch (e) {
        const status = (e as any)?.status || 400;
        return res.status(status).send({ error: (e as any)?.response?.error || 'error' });
      }
    });
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

  it('rejects invalid graph value on PUT', async () => {
    const res = await fastify.inject({ method: 'PUT', url: '/api/graph/variables/A', payload: { graph: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_VALUE');
  });

  it('deletes variable from graph and local override', async () => {
    await fastify.inject({ method: 'PUT', url: '/api/graph/variables/C', payload: { local: 'LC2' } });
    const resDel = await fastify.inject({ method: 'DELETE', url: '/api/graph/variables/C' }); expect(resDel.statusCode).toBe(204);
    const resList = await fastify.inject({ method: 'GET', url: '/api/graph/variables' });
    const items = resList.json().items as Array<{ key: string }>[]; expect(items.find((i: any) => i.key === 'C')).toBeUndefined();
  });
});
