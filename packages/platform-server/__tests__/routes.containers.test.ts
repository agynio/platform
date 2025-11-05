import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ContainersController, ListContainersQueryDto } from '../src/infra/container/containers.controller';

type Row = {
  containerId: string;
  threadId: string | null;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  createdAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  nodeId?: string;
};

class InMemoryPrismaClient {
  container = {
    rows: [] as Row[],
    async findMany(args: any) {
      const where = (args?.where || {}) as Partial<Row> & { status?: Row['status'] };
      let items = this.rows.slice();
      if (where.status) items = items.filter((r) => r.status === where.status);
      if (where.threadId) items = items.filter((r) => r.threadId === where.threadId);
      if (where.image) items = items.filter((r) => r.image === where.image);
      if ((where as any).nodeId) items = items.filter((r) => r.nodeId === (where as any).nodeId);
      const orderBy = args?.orderBy || { lastUsedAt: 'desc' };
      const [[col, dir]] = Object.entries(orderBy);
      items.sort((a, b) => {
        const av = (col === 'createdAt' ? a.createdAt : col === 'killAfterAt' ? a.killAfterAt : a.lastUsedAt) || new Date(0);
        const bv = (col === 'createdAt' ? b.createdAt : col === 'killAfterAt' ? b.killAfterAt : b.lastUsedAt) || new Date(0);
        return dir === 'asc' ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
      });
      const take = typeof args?.take === 'number' ? args.take : items.length;
      return items.slice(0, take).map((r) => ({
        containerId: r.containerId,
        threadId: r.threadId,
        image: r.image,
        status: r.status,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        killAfterAt: r.killAfterAt,
      }));
    },
  };
}

class PrismaStub { client = new InMemoryPrismaClient(); getClient() { return this.client as unknown as any; } }

describe('ContainersController routes', () => {
  let fastify: any; let prismaSvc: PrismaStub; let controller: ContainersController;

  beforeEach(async () => {
    fastify = Fastify({ logger: false }); prismaSvc = new PrismaStub();
    controller = new ContainersController(prismaSvc as any);
    // Typed query adapter to avoid any/double assertions
    const isStatus = (v: unknown): v is 'running' | 'stopped' | 'terminating' | 'failed' =>
      typeof v === 'string' && ['running', 'stopped', 'terminating', 'failed'].includes(v);
    const isSortBy = (v: unknown): v is 'lastUsedAt' | 'startedAt' | 'killAfterAt' =>
      typeof v === 'string' && ['lastUsedAt', 'startedAt', 'killAfterAt'].includes(v);
    const isSortDir = (v: unknown): v is 'asc' | 'desc' => typeof v === 'string' && ['asc', 'desc'].includes(v);
    fastify.get('/api/containers', async (req, res) => {
      const q = (req as { query?: Record<string, unknown> }).query || {};
      const dto: ListContainersQueryDto = {
        status: isStatus(q.status) ? q.status : undefined,
        threadId: typeof q.threadId === 'string' ? q.threadId : undefined,
        image: typeof q.image === 'string' ? q.image : undefined,
        nodeId: typeof q.nodeId === 'string' ? q.nodeId : undefined,
        sortBy: isSortBy(q.sortBy) ? q.sortBy : undefined,
        sortDir: isSortDir(q.sortDir) ? q.sortDir : undefined,
        limit: typeof q.limit === 'string' ? Number(q.limit) : undefined,
      };
      return res.send(await controller.list(dto));
    });
    // seed data
    const now = Date.now();
    const mk = (i: number, status: Row['status'], threadId: string | null): Row => ({
      containerId: `cid-${i}`,
      threadId,
      image: `img:${i}`,
      status,
      createdAt: new Date(now - i * 1000),
      lastUsedAt: new Date(now - i * 500),
      killAfterAt: i % 2 === 0 ? new Date(now + 10000 + i) : null,
    });
    const rows: Row[] = [mk(1, 'running', '11111111-1111-1111-1111-111111111111'), mk(2, 'running', null), mk(3, 'stopped', null)];
    prismaSvc.client.container.rows = rows;
  });

  it('lists running containers by default and maps startedAt', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers' }); expect(res.statusCode).toBe(200);
    type ContainerTestItem = { containerId: string; threadId: string | null; image: string; status: string; startedAt: string; lastUsedAt: string; killAfterAt: string | null };
    type ListResponse = { items: ContainerTestItem[] };
    const body = res.json() as ListResponse;
    const items = body.items;
    // default filter excludes stopped
    expect(items.every((i) => i.status === 'running')).toBe(true);
    // startedAt should exist and be derived from createdAt
    const first = items[0]; expect(typeof first.startedAt).toBe('string'); expect(typeof first.lastUsedAt).toBe('string');
    // verify mapping equals underlying createdAt ISO
    const src = prismaSvc.client.container.rows.find((r) => r.containerId === first.containerId)!;
    expect(first.startedAt).toBe(src.createdAt.toISOString());
  });

  it('supports sorting by lastUsedAt desc', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?sortBy=lastUsedAt&sortDir=desc' }); expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    // mk(1) has lastUsedAt newer than mk(2)
    expect(items[0].containerId).toBe('cid-1');
  });

  it('filters by threadId when provided', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?threadId=11111111-1111-1111-1111-111111111111' }); expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ threadId: string | null }> }).items;
    expect(items.length).toBe(1);
    expect(items[0].threadId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('applies limit bounds and returns at most requested items', async () => {
    // add more running rows
    const now = Date.now();
    const mkRun = (i: number): Row => ({
      containerId: `cid-x-${i}`,
      threadId: null,
      image: `imgx:${i}`,
      status: 'running',
      createdAt: new Date(now - i * 2000),
      lastUsedAt: new Date(now - i * 1000),
      killAfterAt: null,
    });
    prismaSvc.client.container.rows.push(mkRun(4), mkRun(5), mkRun(6));
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?limit=1' });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    expect(items.length).toBe(1);
  });
});
