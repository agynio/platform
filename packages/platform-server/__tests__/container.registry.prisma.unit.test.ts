import { describe, it, expect, beforeEach } from 'vitest';
import { ContainerRegistry, type ContainerStatus, type ContainerMetadata } from '../src/infra/container/container.registry';

type ContainerRow = {
  containerId: string;
  dockerContainerId: string | null;
  nodeId: string;
  threadId: string | null;
  providerType: 'docker';
  image: string;
  name: string;
  status: ContainerStatus;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  terminationReason: string | null;
  deletedAt: Date | null;
  metadata: ContainerMetadata | null;
};

class FakePrismaClient {
  private rows = new Map<string, ContainerRow>();
  container = {
    upsert: async (args: { where: { containerId: string }; create: Partial<ContainerRow> & { containerId: string }; update: Partial<ContainerRow> }) => {
      const key = args.where.containerId as string;
      const existing = this.rows.get(key);
      if (!existing) {
        const create = args.create;
        const now = new Date();
        if (typeof create.name !== 'string' || !create.name.trim()) {
          throw new Error('name required');
        }
        const name = create.name as string;
        const row: ContainerRow = {
          containerId: create.containerId,
          dockerContainerId: (create.dockerContainerId as string | null) ?? null,
          nodeId: create.nodeId as string,
          threadId: (create.threadId as string | null) ?? null,
          providerType: 'docker',
          image: create.image as string,
          name,
          status: (create.status as ContainerStatus) ?? 'running',
          createdAt: now,
          updatedAt: now,
          lastUsedAt: create.lastUsedAt as Date,
          killAfterAt: (create.killAfterAt as Date | null) ?? null,
          terminationReason: null,
          deletedAt: null,
          metadata: (create.metadata as ContainerMetadata | null) ?? null,
        };
        this.rows.set(key, row);
        return row;
      } else {
        const update = args.update;
        existing.nodeId = (update.nodeId as string) ?? existing.nodeId;
        existing.dockerContainerId = (update.dockerContainerId as string | null) ?? existing.dockerContainerId;
        existing.threadId = (update.threadId as string | null) ?? existing.threadId;
        existing.image = (update.image as string) ?? existing.image;
        if ('name' in update) {
          const nextName = update.name as string;
          if (typeof nextName !== 'string' || !nextName.trim()) throw new Error('name required');
          existing.name = nextName;
        }
        existing.status = (update.status as ContainerStatus) ?? existing.status;
        existing.updatedAt = new Date();
        existing.lastUsedAt = (update.lastUsedAt as Date) ?? existing.lastUsedAt;
        existing.killAfterAt = (update.killAfterAt as Date | null) ?? existing.killAfterAt;
        existing.terminationReason = (update.terminationReason as string | null) ?? existing.terminationReason;
        existing.deletedAt = (update.deletedAt as Date | null) ?? existing.deletedAt;
        existing.metadata = (update.metadata as ContainerMetadata | null) ?? existing.metadata;
        return existing;
      }
    },
    findUnique: async (args: { where: { containerId: string } }) => {
      const key = args.where.containerId as string;
      return this.rows.get(key) || null;
    },
    update: async (args: { where: { containerId: string }; data: Partial<ContainerRow> }) => {
      const key = args.where.containerId as string;
      const existing = this.rows.get(key);
      if (!existing) throw new Error('Not found');
      const data = args.data;
      existing.updatedAt = new Date();
      if ('status' in data) existing.status = (data.status as ContainerStatus) ?? existing.status;
      if ('terminationReason' in data) existing.terminationReason = (data.terminationReason as string | null) ?? existing.terminationReason;
      if ('deletedAt' in data) existing.deletedAt = (data.deletedAt as Date | null) ?? existing.deletedAt;
      if ('lastUsedAt' in data) existing.lastUsedAt = (data.lastUsedAt as Date) ?? existing.lastUsedAt;
      if ('killAfterAt' in data) existing.killAfterAt = (data.killAfterAt as Date | null) ?? existing.killAfterAt;
      if ('metadata' in data) existing.metadata = (data.metadata as ContainerMetadata | null) ?? existing.metadata;
      if ('dockerContainerId' in data) existing.dockerContainerId = (data.dockerContainerId as string | null) ?? existing.dockerContainerId;
      if ('threadId' in data) existing.threadId = (data.threadId as string | null) ?? existing.threadId;
      if ('name' in data) {
        const nextName = data.name as string;
        if (typeof nextName !== 'string' || !nextName.trim()) throw new Error('name required');
        existing.name = nextName;
      }
      return existing;
    },
    updateMany: async (args: { where: { containerId: string; status: ContainerStatus }; data: { status: ContainerStatus; metadata?: ContainerMetadata | null } }) => {
      const id = args.where.containerId;
      const status = args.where.status;
      const row = this.rows.get(id);
      if (row && row.status === status) {
        row.status = args.data.status;
        row.metadata = (args.data.metadata as ContainerMetadata | null) ?? row.metadata;
        row.updatedAt = new Date();
        return { count: 1 };
      }
      return { count: 0 };
    },
    findMany: async (args?: { where?: { status?: ContainerStatus; killAfterAt?: { not: null; lte: Date }; containerId?: { in: string[] } } }) => {
      if (args?.where?.status && args?.where?.killAfterAt) {
        const notNull = args.where.killAfterAt.not === null;
        const lte = args.where.killAfterAt.lte;
        return Array.from(this.rows.values()).filter(
          (r) => r.status === args.where.status && (notNull ? r.killAfterAt != null : true) && (r.killAfterAt! <= lte),
        );
      }
      if (args?.where?.containerId?.in) {
        const ids: string[] = args.where.containerId.in;
        return ids.map((id) => this.rows.get(id)).filter(Boolean) as ContainerRow[];
      }
      return Array.from(this.rows.values());
    },
  };
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ containerId: string }>> {
    const nowIso = values[0] as string;
    const now = new Date(nowIso);
    const results = Array.from(this.rows.values())
      .filter((r) => r.status === 'terminating')
      .filter((r) => {
        const ra = r.metadata?.retryAfter as string | undefined;
        if (!ra) return true;
        try {
          return new Date(ra) <= now;
        } catch {
          return false;
        }
      })
      .map((r) => ({ containerId: r.containerId }));
    return results;
  }
}

describe('ContainerRegistry (Prisma-backed)', () => {
  let prisma: FakePrismaClient;
  let registry: ContainerRegistry;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    registry = new ContainerRegistry(prisma as unknown as import('@prisma/client').PrismaClient);
  });

  it('registerStart creates records deterministically', async () => {
    await registry.registerStart({
      containerId: 'abc',
      nodeId: 'node-1',
      threadId: '00000000-0000-0000-0000-000000000001',
      image: 'node:20',
      labels: { 'hautech.ai/role': 'workspace' },
      ttlSeconds: 10,
      name: '/workspace-main',
    });
    const row = await prisma.container.findUnique({ where: { containerId: 'abc' } });
    expect(row).toBeTruthy();
    expect(row!.status).toBe('running');
    expect(row!.killAfterAt).not.toBeNull();
    expect(row!.metadata!.ttlSeconds).toBe(10);
    expect(row!.dockerContainerId).toBe('abc');
    expect(row!.name).toBe('workspace-main');
  });

  it('updateLastUsed does not create when missing', async () => {
    const before = await prisma.container.findMany({});
    expect(before.length).toBe(0);
    await registry.updateLastUsed('missing');
    const after = await prisma.container.findMany({});
    expect(after.length).toBe(0);
  });

  it('claimForTermination performs CAS update', async () => {
    await registry.registerStart({ containerId: 'cid1', nodeId: 'n', threadId: '', image: 'img', name: '/cid1' });
    const ok1 = await registry.claimForTermination('cid1', 'claim');
    expect(ok1).toBe(true);
    const ok2 = await registry.claimForTermination('cid1', 'claim2');
    expect(ok2).toBe(false);
  });

  it('getExpired returns running past killAfter and terminating past retryAfter', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 60_000);
    await registry.registerStart({ containerId: 'r1', nodeId: 'n', threadId: '', image: 'img', ttlSeconds: 0, name: '/r1' });
    await prisma.container.update({ where: { containerId: 'r1' }, data: { killAfterAt: past } });
    await registry.registerStart({ containerId: 't1', nodeId: 'n', threadId: '', image: 'img', name: '/t1' });
    await prisma.container.update({ where: { containerId: 't1' }, data: { status: 'terminating', metadata: {} as ContainerMetadata } });
    await registry.registerStart({ containerId: 't2', nodeId: 'n', threadId: '', image: 'img', name: '/t2' });
    await prisma.container.update({
      where: { containerId: 't2' },
      data: { status: 'terminating', metadata: { labels: {}, ttlSeconds: 86400, retryAfter: future.toISOString() } as ContainerMetadata },
    });
    const expired = await registry.getExpired(now);
    const ids = expired.map((r) => r.containerId);
    expect(ids).toContain('r1');
    expect(ids).toContain('t1');
    expect(ids).not.toContain('t2');
  });

  it('recordTerminationFailure sets backoff metadata', async () => {
    await registry.registerStart({ containerId: 'x', nodeId: 'n', threadId: '', image: 'img', name: '/x' });
    await registry.markTerminating('x', 'cleanup');
    await registry.recordTerminationFailure('x', 'oops');
    const row = await prisma.container.findUnique({ where: { containerId: 'x' } });
    expect(row!.metadata!.lastError).toBe('oops');
    expect(typeof row!.metadata!.retryAfter).toBe('string');
    expect(row!.metadata!.terminationAttempts).toBe(1);
  });

  it('markStopped sets status and deletedAt', async () => {
    await registry.registerStart({ containerId: 'y', nodeId: 'n', threadId: '', image: 'img', name: '/y' });
    await registry.markStopped('y', 'ttl_expired');
    const row = await prisma.container.findUnique({ where: { containerId: 'y' } });
    expect(row!.status).toBe('stopped');
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(row!.terminationReason).toBe('ttl_expired');
  });
});
