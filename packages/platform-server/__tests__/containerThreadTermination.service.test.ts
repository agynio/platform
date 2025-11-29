import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import type { ContainerMetadata, ContainerStatus } from '../src/infra/container/container.registry';
import type { PrismaClient } from '@prisma/client';
import type { ContainerService } from '../src/infra/container/container.service';
import type { PrismaService } from '../src/core/services/prisma.service';

type Row = {
  containerId: string;
  threadId: string | null;
  status: ContainerStatus;
  metadata: ContainerMetadata;
  terminationReason?: string | null;
  name?: string;
};

const ISO_NOW = '2024-01-02T03:04:05.000Z';

const createHarness = () => {
  const rows = new Map<string, Row>();
  const labels = new Map<string, Record<string, string>>();

  const prisma = {
    container: {
      findMany: vi.fn(async ({ where }: { where: { threadId?: string; status?: { in: ContainerStatus[] } } }) => {
        const threadId = where?.threadId;
        const statusSet = where?.status?.in;
        return Array.from(rows.values())
          .filter((row) => (threadId ? row.threadId === threadId : true))
          .filter((row) => (!statusSet ? true : statusSet.includes(row.status)))
          .map((row) => ({ containerId: row.containerId, status: row.status, metadata: row.metadata }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { containerId: string } }) => {
        const row = rows.get(where.containerId);
        if (!row) return null;
        return { containerId: row.containerId, status: row.status, metadata: row.metadata };
      }),
      update: vi.fn(async ({ where, data }: { where: { containerId: string }; data: Partial<Row> & { metadata?: ContainerMetadata } }) => {
        const row = rows.get(where.containerId);
        if (!row) throw new Error(`Missing container ${where.containerId}`);
        if (data.status) row.status = data.status;
        if (data.terminationReason !== undefined) row.terminationReason = data.terminationReason;
        if (data.metadata) row.metadata = data.metadata;
        return { containerId: row.containerId, status: row.status, metadata: row.metadata };
      }),
    },
  } as unknown as PrismaClient;

  const registry = {
    claimForTermination: vi.fn(async (containerId: string, claimId: string) => {
      const row = rows.get(containerId);
      if (!row || row.status !== 'running') return false;
      row.status = 'terminating';
      row.metadata.claimId = claimId;
      return true;
    }),
    registerStart: vi.fn(async (args: { containerId: string; threadId: string; labels?: Record<string, string>; platform?: string; ttlSeconds?: number; nodeId: string; image: string; name: string }) => {
      const meta: ContainerMetadata = {
        labels: args.labels ?? {},
        platform: args.platform,
        ttlSeconds: args.ttlSeconds ?? 86400,
      };
      if (typeof args.name !== 'string' || !args.name.trim()) throw new Error('name required');
      rows.set(args.containerId, {
        containerId: args.containerId,
        threadId: args.threadId || null,
        status: 'running',
        metadata: meta,
        name: args.name,
      });
      if (args.labels) labels.set(args.containerId, args.labels);
    }),
  };

  const containerService: Partial<ContainerService> = {
    findContainersByLabels: vi.fn(async (filter: Record<string, string>) => {
      const matches: string[] = [];
      for (const [id, lbl] of labels.entries()) {
        let ok = true;
        for (const [k, v] of Object.entries(filter)) {
          if (lbl[k] !== v) {
            ok = false;
            break;
          }
        }
        if (ok) matches.push(id);
      }
      return matches.map((id) => ({ id })) as unknown as ReturnType<ContainerService['findContainersByLabels']>;
    }),
    getContainerLabels: vi.fn(async (containerId: string) => labels.get(containerId)),
  };

  const prismaService: Partial<PrismaService> = {
    getClient: () => prisma,
  };

  const service = new ContainerThreadTerminationService(
    registry as unknown as any,
    containerService as ContainerService,
    prismaService as PrismaService,
  );

  return { service, rows, labels, registry, containerService };
};

describe('ContainerThreadTerminationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ISO_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('claims running containers and marks retryAfter to now', async () => {
    const { service, rows, labels, registry } = createHarness();
    rows.set('cid1', {
      containerId: 'cid1',
      threadId: 'thread-1',
      status: 'running',
      metadata: { labels: { 'hautech.ai/role': 'workspace' }, ttlSeconds: 86400 },
      name: 'cid1-name',
    });
    labels.set('cid1', { 'hautech.ai/thread_id': 'thread-1', 'hautech.ai/role': 'workspace' });

    await service.terminateByThread('thread-1', { synchronous: true });

    const row = rows.get('cid1');
    expect(row?.status).toBe('terminating');
    expect(row?.terminationReason).toBe('thread_closed');
    expect(row?.metadata.retryAfter).toBe(ISO_NOW);
    expect(registry.claimForTermination).toHaveBeenCalledWith('cid1', expect.any(String));
  });

});
