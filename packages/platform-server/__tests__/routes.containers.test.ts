import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { ContainersController, ListContainersQueryDto, ListContainerEventsQueryDto } from '../src/infra/container/containers.controller';
import type { PrismaClient, ContainerEventType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ContainerAdminService } from '../src/infra/container/containerAdmin.service';

type ContainerHealth = 'healthy' | 'unhealthy' | 'starting';
type RowMetadata = {
  labels?: Record<string, string>;
  autoRemoved?: boolean;
  health?: ContainerHealth;
  lastEventAt?: string;
} | null;

type Row = {
  containerId: string;
  threadId: string | null;
  image: string;
  name: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  createdAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  updatedAt: Date;
  nodeId?: string;
  metadata?: RowMetadata;
};

type SortOrder = 'asc' | 'desc';
type ContainerEventRow = {
  id: number;
  container: { containerId: string };
  eventType: ContainerEventType;
  exitCode: number | null;
  signal: string | null;
  reason: string | null;
  message: string | null;
  health: string | null;
  createdAt: Date;
};
type ContainerWhereInput = {
  status?: Row['status'] | { in: Row['status'][] };
  threadId?: string | null;
  image?: string;
  nodeId?: string;
  updatedAt?: { gte?: Date };
};
type ContainerEventWhereInput = {
  containerId?: string;
  container?: { containerId?: string };
  createdAt?: Date | { gte?: Date; gt?: Date; lt?: Date };
  id?: number | { gt?: number; lt?: number };
  AND?: ContainerEventWhereInput[];
  OR?: ContainerEventWhereInput[];
};
type ContainerOrderByInput = { createdAt?: SortOrder; lastUsedAt?: SortOrder; killAfterAt?: SortOrder };
type ContainerSelect = {
  containerId?: boolean;
  threadId?: boolean;
  image?: boolean;
  name?: boolean;
  status?: boolean;
  createdAt?: boolean;
  lastUsedAt?: boolean;
  killAfterAt?: boolean;
  updatedAt?: boolean;
  metadata?: boolean;
};
type FindManyArgs = { where?: ContainerWhereInput; orderBy?: ContainerOrderByInput; select?: ContainerSelect; take?: number };
type SelectedRow = { containerId: string; threadId: string | null; image: string; name: string; status: Row['status']; createdAt: Date; lastUsedAt: Date; killAfterAt: Date | null; updatedAt: Date };
type SelectedRowWithMeta = SelectedRow & { metadata?: RowMetadata };
type ContainerEventSelect = {
  id?: boolean;
  container?: { select?: { containerId?: boolean } };
  eventType?: boolean;
  exitCode?: boolean;
  signal?: boolean;
  reason?: boolean;
  message?: boolean;
  health?: boolean;
  createdAt?: boolean;
};
type ContainerEventOrderBy = Array<{ createdAt?: SortOrder } | { id?: SortOrder }> | { createdAt?: SortOrder } | { id?: SortOrder };
type ContainerEventFindManyArgs = {
  where?: ContainerEventWhereInput;
  orderBy?: ContainerEventOrderBy;
  select?: ContainerEventSelect;
  take?: number;
};

class InMemoryPrismaClient {
  container = {
    rows: [] as Row[],
    async findMany(args: FindManyArgs): Promise<SelectedRowWithMeta[]> {
      const where = args?.where || {};
      let items = this.rows.slice();
      if (where.status) {
        if (typeof where.status === 'string') {
          items = items.filter((r) => r.status === where.status);
        } else if (Array.isArray((where.status as { in: Row['status'][] }).in)) {
          const statuses = (where.status as { in: Row['status'][] }).in;
          items = items.filter((r) => statuses.includes(r.status));
        }
      }
      if (typeof where.threadId !== 'undefined') items = items.filter((r) => r.threadId === where.threadId);
      if (typeof where.image !== 'undefined') items = items.filter((r) => r.image === where.image);
      if (typeof where.nodeId !== 'undefined') items = items.filter((r) => r.nodeId === where.nodeId);
      if (where.updatedAt?.gte) {
        const threshold = where.updatedAt.gte.getTime();
        items = items.filter((r) => r.updatedAt.getTime() >= threshold);
      }
      const orderBy = args?.orderBy || { lastUsedAt: 'desc' };
      const [[col, dir]] = Object.entries(orderBy) as [keyof ContainerOrderByInput, SortOrder][];
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
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        killAfterAt: r.killAfterAt,
        updatedAt: r.updatedAt,
        metadata: r.metadata,
      }));
    },
    async findUnique(args: { where: { containerId: string } }): Promise<Row | null> {
      const id = args?.where?.containerId;
      if (!id) return null;
      return this.rows.find((row) => row.containerId === id) ?? null;
    },
  };
  containerEvent = {
    rows: [] as ContainerEventRow[],
    async findMany(args: ContainerEventFindManyArgs = {}): Promise<Array<Partial<ContainerEventRow>>> {
      const matches = (row: ContainerEventRow, condition?: ContainerEventWhereInput): boolean => {
        if (!condition) return true;
        const { AND, OR, ...scalar } = condition;
        if (AND && !AND.every((clause) => matches(row, clause))) return false;
        if (OR && !OR.some((clause) => matches(row, clause))) return false;

        if (scalar.containerId && row.container.containerId !== scalar.containerId) {
          return false;
        }

        if (scalar.container?.containerId && row.container.containerId !== scalar.container.containerId) {
          return false;
        }

        if (typeof scalar.createdAt !== 'undefined') {
          const value = scalar.createdAt;
          const time = row.createdAt.getTime();
          if (value instanceof Date) {
            if (time !== value.getTime()) return false;
          } else {
            if (value.gte && time < value.gte.getTime()) return false;
            if (value.gt && time <= value.gt.getTime()) return false;
            if (value.lt && time >= value.lt.getTime()) return false;
          }
        }

        if (typeof scalar.id !== 'undefined') {
          const value = scalar.id;
          if (typeof value === 'number') {
            if (row.id !== value) return false;
          } else {
            if (typeof value.gt === 'number' && !(row.id > value.gt)) return false;
            if (typeof value.lt === 'number' && !(row.id < value.lt)) return false;
          }
        }

        return true;
      };

      const where = args.where ?? {};
      const items = this.rows.slice().filter((row) => matches(row, where));

      const orderings = Array.isArray(args.orderBy)
        ? args.orderBy
        : args.orderBy
          ? [args.orderBy]
          : [{ createdAt: 'desc' as SortOrder }];

      items.sort((a, b) => {
        for (const ordering of orderings) {
          const entries = Object.entries(ordering) as [keyof ContainerEventRow, SortOrder][];
          if (entries.length === 0) {
            continue;
          }
          const [field, dir] = entries[0];
          let comparison = 0;
          if (field === 'createdAt') {
            comparison = a.createdAt.getTime() - b.createdAt.getTime();
          } else if (field === 'id') {
            comparison = a.id - b.id;
          }
          if (comparison !== 0) {
            return dir === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });

      const take = typeof args.take === 'number' ? args.take : items.length;
      const sliced = items.slice(0, take);
      if (!args.select) return sliced;
      return sliced.map((row) => {
        const picked: Partial<ContainerEventRow> & { container?: { containerId: string } } = {};
        if (args.select?.id) picked.id = row.id;
        if (args.select?.eventType) picked.eventType = row.eventType;
        if (args.select?.exitCode) picked.exitCode = row.exitCode;
        if (args.select?.signal) picked.signal = row.signal;
        if (args.select?.reason) picked.reason = row.reason;
        if (args.select?.message) picked.message = row.message;
        if (args.select?.health) picked.health = row.health;
        if (args.select?.createdAt) picked.createdAt = row.createdAt;
        if (args.select?.container) {
          const containerSelect = args.select.container.select ?? {};
          const container: { containerId?: string } = {};
          if (containerSelect.containerId) {
            container.containerId = row.container.containerId;
          }
          if (Object.keys(container).length > 0) {
            picked.container = container as { containerId: string };
          }
        }
        return picked;
      });
    },
  };
}

type MinimalPrismaClient = {
  container: {
    findMany(args: FindManyArgs): Promise<SelectedRowWithMeta[]>;
    findUnique(args: { where: { containerId: string } }): Promise<Row | null>;
    rows: Row[];
  };
  containerEvent: { findMany(args: ContainerEventFindManyArgs): Promise<Array<Partial<ContainerEventRow>>>; rows: ContainerEventRow[] };
};
class PrismaStub {
  client: MinimalPrismaClient = new InMemoryPrismaClient();
  // Strict typing to match controller signature; cast internally
  getClient(): PrismaClient { return this.client as unknown as PrismaClient; }
}

class PrismaStubWithQueryRaw {
  private base: MinimalPrismaClient & { $queryRaw?: (...args: unknown[]) => Promise<unknown> };
  queryRawCalls: unknown[][] = [];

  constructor(rows: Row[]) {
    this.base = new InMemoryPrismaClient() as unknown as MinimalPrismaClient & {
      $queryRaw?: (...args: unknown[]) => Promise<unknown>;
    };
    this.base.container.rows = rows;
    this.base.$queryRaw = async (...args: unknown[]) => {
      this.queryRawCalls.push(args);
      return [];
    };
  }

  getClient(): PrismaClient {
    return this.base as unknown as PrismaClient;
  }
}

describe('ContainersController routes', () => {
  let fastify: FastifyInstance;
  let prismaSvc: PrismaStub;
  let controller: ContainersController;
  let containerAdmin: Pick<ContainerAdminService, 'deleteContainer'>;

  beforeEach(async () => {
    fastify = Fastify({ logger: false }); prismaSvc = new PrismaStub();
    containerAdmin = {
      deleteContainer: vi.fn().mockResolvedValue(undefined),
    } as Pick<ContainerAdminService, 'deleteContainer'>;
    controller = new ContainersController(prismaSvc, containerAdmin as ContainerAdminService);
    // Typed query adapter to avoid any/double assertions
    const isStatus = (v: unknown): v is Row['status'] | 'all' =>
      typeof v === 'string' && ['running', 'stopped', 'terminating', 'failed', 'all'].includes(v);
    const isSortBy = (v: unknown): v is 'lastUsedAt' | 'startedAt' | 'killAfterAt' =>
      typeof v === 'string' && ['lastUsedAt', 'startedAt', 'killAfterAt'].includes(v);
    const isSortDir = (v: unknown): v is 'asc' | 'desc' => typeof v === 'string' && ['asc', 'desc'].includes(v);
    type ReqWithQuery = { query?: Record<string, unknown> };
    fastify.get('/api/containers', async (req, res) => {
      const q: Record<string, unknown> = (req as ReqWithQuery).query || {};
      const dto: ListContainersQueryDto = {
        status: isStatus(q.status) ? q.status : undefined,
        includeStopped: typeof q.includeStopped === 'string'
          ? ['true', '1'].includes(q.includeStopped.toLowerCase())
          : undefined,
        threadId: typeof q.threadId === 'string' ? q.threadId : undefined,
        image: typeof q.image === 'string' ? q.image : undefined,
        nodeId: typeof q.nodeId === 'string' ? q.nodeId : undefined,
        sortBy: isSortBy(q.sortBy) ? q.sortBy : undefined,
        sortDir: isSortDir(q.sortDir) ? q.sortDir : undefined,
        limit: typeof q.limit === 'string' ? Number(q.limit) : undefined,
        since: typeof q.since === 'string' ? q.since : undefined,
      };
      return res.send(await controller.list(dto));
    });
    fastify.get('/api/containers/:containerId/events', async (req, res) => {
      const params = (req as { params?: Record<string, unknown> }).params ?? {};
      const { containerId } = params as { containerId?: string };
      const q: Record<string, unknown> = (req as ReqWithQuery).query || {};
      const dto: ListContainerEventsQueryDto = {
        limit: typeof q.limit === 'string' ? Number(q.limit) : typeof q.limit === 'number' ? q.limit : undefined,
        order: typeof q.order === 'string' && (q.order === 'asc' || q.order === 'desc') ? q.order : undefined,
        since: typeof q.since === 'string' ? q.since : undefined,
        cursor: typeof q.cursor === 'string' ? q.cursor : undefined,
      };
      return res.send(await controller.listEvents(containerId ?? '', dto));
    });
    // seed data
    const now = Date.now();
    const mk = (i: number, status: Row['status'], threadId: string | null): Row => ({
      containerId: `cid-${i}`,
      threadId,
      image: `img:${i}`,
      name: i === 1 ? 'workspace_main' : `workspace_${i}`,
      status,
      createdAt: new Date(now - i * 1000),
      lastUsedAt: new Date(now - i * 500),
      killAfterAt: i % 2 === 0 ? new Date(now + 10000 + i) : null,
      updatedAt: new Date(now - i * 400),
      metadata: i === 1
        ? { labels: { 'hautech.ai/role': 'workspace' } }
        : i === 3
          ? { labels: { 'hautech.ai/role': 'workspace' }, autoRemoved: true, health: 'unhealthy', lastEventAt: new Date(now - 2000).toISOString() }
          : null,
    });
    const rows: Row[] = [
      mk(1, 'running', '11111111-1111-1111-1111-111111111111'),
      mk(2, 'running', null),
      mk(3, 'stopped', null),
      // DinD sidecar for cid-1
      {
        containerId: 'sidecar-1',
        threadId: '11111111-1111-1111-1111-111111111111',
        image: 'dind:latest',
        status: 'running',
        createdAt: new Date(now - 4000),
        lastUsedAt: new Date(now - 2000),
        killAfterAt: null,
        updatedAt: new Date(now - 1500),
        name: 'dind_helper',
        metadata: { labels: { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': 'cid-1' } },
      },
    ];
    prismaSvc.client.container.rows = rows;
    prismaSvc.client.containerEvent.rows = [];
  });

  it('lists running containers by default and maps startedAt', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers' }); expect(res.statusCode).toBe(200);
    type ContainerTestItem = {
      containerId: string;
      threadId: string | null;
      image: string;
      name: string;
      status: string;
      startedAt: string;
      lastUsedAt: string;
      killAfterAt: string | null;
      role: string;
      autoRemoved: boolean;
      health: string | null;
      lastEventAt: string | null;
      sidecars?: Array<{ containerId: string; role: string; image: string; status: string; name: string }>;
    };
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
    // role should default/workspace
    expect(first.role).toBe('workspace');
    expect(first.name).toBe('workspace_main');
    expect(first.sidecars?.[0]?.name).toBe('dind_helper');
    expect(first.autoRemoved).toBe(false);
    expect(first.health).toBeNull();
    expect(first.lastEventAt).toBeNull();
    // sidecars for cid-1 include a dind
    expect(first.sidecars && first.sidecars.length).toBeGreaterThan(0);
    expect(first.sidecars![0]).toMatchObject({ containerId: 'sidecar-1', role: 'dind', image: 'dind:latest', status: 'running' });
  });

  it('supports sorting by lastUsedAt desc', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?sortBy=lastUsedAt&sortDir=desc' }); expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    // mk(1) has lastUsedAt newer than mk(2)
    expect(items[0].containerId).toBe('cid-1');
  });

  it('includes stopped containers when includeStopped is true', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?includeStopped=true' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ status: string; autoRemoved: boolean; health: string | null; lastEventAt: string | null }> };
    const items = body.items;
    expect(items.some((item) => item.status === 'stopped')).toBe(true);
    expect(items.some((item) => item.status === 'running')).toBe(true);
    const stopped = items.find((item) => item.status === 'stopped');
    expect(stopped?.autoRemoved).toBe(true);
    expect(stopped?.health).toBe('unhealthy');
    expect(typeof stopped?.lastEventAt).toBe('string');
  });

  it('returns only stopped containers when status is stopped', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?status=stopped' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ containerId: string; status: string; autoRemoved: boolean; health: string | null; lastEventAt: string | null }> };
    const items = body.items;
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({ containerId: 'cid-3', status: 'stopped', autoRemoved: true, health: 'unhealthy' });
    expect(typeof items[0].lastEventAt).toBe('string');
  });

  it('returns all containers when status is all', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?status=all' });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ status: string }> }).items;
    expect(items.length).toBe(3);
  });

  it('filters by updatedAt when since provided', async () => {
    const threshold = prismaSvc.client.container.rows.find((r) => r.containerId === 'cid-1')!.updatedAt;
    const iso = new Date(threshold.getTime() - 200).toISOString();
    const res = await fastify.inject({ method: 'GET', url: `/api/containers?since=${encodeURIComponent(iso)}` });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    expect(items.map((item) => item.containerId)).toEqual(['cid-1']);
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
      name: `workspace_x_${i}`,
      status: 'running',
      createdAt: new Date(now - i * 2000),
      lastUsedAt: new Date(now - i * 1000),
      killAfterAt: null,
      updatedAt: new Date(now - i * 800),
    });
    prismaSvc.client.container.rows.push(mkRun(4), mkRun(5), mkRun(6));
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?limit=1' });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    expect(items.length).toBe(1);
  });

  it('skips $queryRaw when list has no non-dind parents', async () => {
    const now = new Date();
    const rows: Row[] = [
      {
        containerId: 'sidecar-only',
        threadId: 'parentless-thread',
        image: 'dind:latest',
        name: 'orphan_dind',
        status: 'running',
        createdAt: now,
        lastUsedAt: now,
        killAfterAt: null,
        updatedAt: now,
        metadata: { labels: { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': 'missing' } },
      },
    ];
    const prismaSvcWithRaw = new PrismaStubWithQueryRaw(rows);
    const rawController = new ContainersController(prismaSvcWithRaw);
    const result = await rawController.list({} as ListContainersQueryDto);
    expect(result.items).toEqual([]);
    expect(prismaSvcWithRaw.queryRawCalls.length).toBe(0);
  });

  it('returns container events with pagination cursors', async () => {
    const base = new Date('2024-01-01T00:00:00.000Z');
    prismaSvc.client.containerEvent.rows = [
      {
        id: 1,
        container: { containerId: 'cid-1' },
        eventType: 'die',
        exitCode: 137,
        signal: null,
        reason: 'OOMKilled',
        message: 'OOMKilled',
        health: null,
        createdAt: new Date(base.getTime()),
      },
      {
        id: 2,
        container: { containerId: 'cid-1' },
        eventType: 'stop',
        exitCode: 0,
        signal: null,
        reason: 'ContainerStopped',
        message: 'stop',
        health: null,
        createdAt: new Date(base.getTime() + 1000),
      },
      {
        id: 9,
        container: { containerId: 'cid-1' },
        eventType: 'stop',
        exitCode: 0,
        signal: null,
        reason: 'ContainerStopped',
        message: 'stop-late',
        health: null,
        createdAt: new Date(base.getTime() + 1000),
      },
      {
        id: 3,
        container: { containerId: 'cid-1' },
        eventType: 'start',
        exitCode: null,
        signal: null,
        reason: 'ContainerStarted',
        message: 'start',
        health: 'healthy',
        createdAt: new Date(base.getTime() + 2000),
      },
      {
        id: 42,
        container: { containerId: 'cid-2' },
        eventType: 'die',
        exitCode: 1,
        signal: null,
        reason: 'OtherContainer',
        message: 'irrelevant',
        health: null,
        createdAt: new Date(base.getTime() + 3000),
      },
    ];

    const res = await fastify.inject({ method: 'GET', url: '/api/containers/cid-1/events?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; eventType: string; health: string | null; createdAt: string }>;
      page: { order: string; limit: number; nextBefore: string | null; nextAfter: string | null };
    };
    expect(body.items.map((item) => item.id)).toEqual(['3', '9']);
    expect(body.items[0]).toMatchObject({ eventType: 'start', health: 'healthy' });
    expect(body.page).toMatchObject({ order: 'desc', limit: 2, nextAfter: null });
    expect(body.page.nextBefore).toMatch(/^2024-01-01T00:00:01\.000Z\|9$/);

    if (!body.page.nextBefore) throw new Error('Expected nextBefore cursor');
    const resNext = await fastify.inject({
      method: 'GET',
      url: `/api/containers/cid-1/events?cursor=${encodeURIComponent(body.page.nextBefore)}&limit=2`,
    });
    expect(resNext.statusCode).toBe(200);
    const nextBody = resNext.json() as {
      items: Array<{ id: string }>;
      page: { nextBefore: string | null };
    };
    expect(nextBody.items.map((item) => item.id)).toEqual(['2', '1']);
    expect(nextBody.page.nextBefore).toBeNull();
  });

  it('rejects invalid cursor format for container events', async () => {
    prismaSvc.client.containerEvent.rows = [
      {
        id: 101,
        container: { containerId: 'cid-1' },
        eventType: 'start',
        exitCode: null,
        signal: null,
        reason: 'ContainerStarted',
        message: 'started',
        health: 'healthy',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ];

    const res = await fastify.inject({ method: 'GET', url: '/api/containers/cid-1/events?cursor=not-a-cursor' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { message: string };
    expect(body.message).toMatch(/cursor/i);
  });

  it('calls ContainerAdminService when deleting an existing container', async () => {
    await expect(controller.delete('cid-1')).resolves.toBeUndefined();
    expect(containerAdmin.deleteContainer).toHaveBeenCalledWith('cid-1');
  });

  it('rejects with NotFound when deleting a missing container', async () => {
    await expect(controller.delete('missing-cid')).rejects.toThrowError('container_not_found');
    expect(containerAdmin.deleteContainer).not.toHaveBeenCalled();
  });
});
