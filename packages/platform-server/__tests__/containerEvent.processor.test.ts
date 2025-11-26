import { beforeEach, describe, expect, it } from 'vitest';
import { ContainerEventProcessor, type DockerEventMessage } from '../src/infra/container/containerEvent.processor';
import type { ContainerEventType, ContainerStatus, PrismaClient } from '@prisma/client';

type ContainerRow = {
  id: number;
  containerId: string;
  dockerContainerId: string | null;
  status: ContainerStatus;
  threadId: string | null;
  terminationReason: string | null;
};

type ContainerEventRow = {
  containerDbId: number;
  eventType: ContainerEventType;
  exitCode: number | null;
  signal: string | null;
  reason: string | null;
  message: string | null;
  createdAt: Date;
};

class FakePrismaClient {
  private containers = new Map<number, ContainerRow>();
  private containersByDockerId = new Map<string, ContainerRow>();
  events: ContainerEventRow[] = [];

  addContainer(row: ContainerRow) {
    this.containers.set(row.id, { ...row });
    if (row.dockerContainerId) this.containersByDockerId.set(row.dockerContainerId, { ...row });
    this.containersByDockerId.set(row.containerId, { ...row });
  }

  getContainerByDockerId(id: string): ContainerRow | undefined {
    for (const row of this.containers.values()) {
      if (row.containerId === id || row.dockerContainerId === id) return { ...row };
    }
    const row = this.containersByDockerId.get(id);
    return row ? { ...row } : undefined;
  }

  container = {
    findUnique: async (args: Parameters<PrismaClient['container']['findUnique']>[0]) => {
      if (!args) return null;
      if (args.where?.containerId) {
        const row = this.containersByDockerId.get(args.where.containerId);
        if (!row) return null;
        return this.pick(row, args.select);
      }
      if (args.where?.id !== undefined) {
        const row = this.containers.get(args.where.id as number);
        if (!row) return null;
        return this.pick(row, args.select);
      }
      return null;
    },
    findFirst: async (args: Parameters<PrismaClient['container']['findFirst']>[0]) => {
      if (!args?.where) return null;
      const { where } = args;
      const ors = Array.isArray(where.OR) ? where.OR : [];
      for (const clause of ors) {
        if (clause.containerId) {
          const row = this.containersByDockerId.get(clause.containerId);
          if (row) return this.pick(row, args.select);
        }
        if (clause.dockerContainerId) {
          const row = this.containersByDockerId.get(clause.dockerContainerId);
          if (row) return this.pick(row, args.select);
        }
      }
      if (where.containerId) {
        const row = this.containersByDockerId.get(where.containerId);
        if (row) return this.pick(row, args.select);
      }
      if (where.dockerContainerId) {
        const row = this.containersByDockerId.get(where.dockerContainerId);
        if (row) return this.pick(row, args.select);
      }
      return null;
    },
    update: async (args: Parameters<PrismaClient['container']['update']>[0]) => {
      const id = args.where.id as number;
      const row = this.containers.get(id);
      if (!row) throw new Error('Container not found');
      const data = args.data;
      if ('status' in data && data.status) {
        const nextStatus = typeof data.status === 'string' ? data.status : (data.status as { set: ContainerStatus }).set;
        row.status = nextStatus as ContainerStatus;
      }
      if ('terminationReason' in data) {
        const nextReason = typeof data.terminationReason === 'string'
          ? data.terminationReason
          : (data.terminationReason as { set: string | null }).set;
        row.terminationReason = nextReason ?? row.terminationReason;
      }
      const nextDocker = (data as Record<string, unknown>).dockerContainerId;
      if (nextDocker === null) row.dockerContainerId = null;
      else if (typeof nextDocker === 'string') row.dockerContainerId = nextDocker;
      else if (nextDocker && typeof nextDocker === 'object' && 'set' in nextDocker) {
        row.dockerContainerId = (nextDocker as { set: string | null }).set ?? row.dockerContainerId;
      }
      const nextThread = (data as Record<string, unknown>).threadId;
      if (nextThread === null) row.threadId = null;
      else if (typeof nextThread === 'string') row.threadId = nextThread;
      else if (nextThread && typeof nextThread === 'object' && 'set' in nextThread) {
        row.threadId = (nextThread as { set: string | null }).set ?? row.threadId;
      }
      this.containersByDockerId.set(row.containerId, { ...row });
      if (row.dockerContainerId) this.containersByDockerId.set(row.dockerContainerId, { ...row });
      return this.pick(row, args.select);
    },
  };

  containerEvent = {
    create: async (args: Parameters<PrismaClient['containerEvent']['create']>[0]) => {
      const data = args.data;
      const row: ContainerEventRow = {
        containerDbId: data.containerDbId,
        eventType: data.eventType,
        exitCode: data.exitCode ?? null,
        signal: data.signal ?? null,
        reason: data.reason ?? null,
        message: data.message ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      this.events.push(row);
      return row;
    },
  };

  private pick<T extends ContainerRow>(row: T, select: Record<string, boolean> | undefined): Partial<ContainerRow> {
    if (!select) return { ...row };
    const entries = Object.entries(select).filter(([, enabled]) => enabled);
    const out: Partial<ContainerRow> = {};
    for (const [key] of entries) {
      const k = key as keyof ContainerRow;
      out[k] = row[k];
    }
    return out;
  }
}

class FakePrismaService {
  constructor(private readonly client: FakePrismaClient) {}
  getClient(): PrismaClient {
    return this.client as unknown as PrismaClient;
  }
}

const makeEvent = (overrides: Partial<DockerEventMessage> & { id?: string; Action?: string }): DockerEventMessage => ({
  Type: 'container',
  id: 'cid-123',
  Actor: { ID: 'cid-123', Attributes: {} },
  time: Math.floor(Date.now() / 1000),
  ...overrides,
});

describe('ContainerEventProcessor', () => {
  let prisma: FakePrismaClient;
  let processor: ContainerEventProcessor;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    prisma.addContainer({ id: 1, containerId: 'cid-123', dockerContainerId: 'cid-123', status: 'running', threadId: null, terminationReason: null });
    processor = new ContainerEventProcessor(new FakePrismaService(prisma));
  });

  it('records oom event and marks container failed', async () => {
    processor.enqueue(
      makeEvent({ Action: 'oom', time: 100, Actor: { ID: 'cid-123', Attributes: { 'exitCode': '0' } } }),
    );
    await processor.drain();

    expect(prisma.events).toHaveLength(1);
    expect(prisma.events[0].reason).toBe('OOMKilled');
    const container = prisma.getContainerByDockerId('cid-123');
    expect(container?.status).toBe('failed');
    expect(container?.terminationReason).toBe('OOMKilled');
  });

  it('maps die exitCode 0 to ExitedNormally and marks container stopped', async () => {
    processor.enqueue(makeEvent({ Action: 'die', time: 101, Actor: { ID: 'cid-123', Attributes: { exitCode: '0' } } }));
    await processor.drain();

    expect(prisma.events).toHaveLength(1);
    expect(prisma.events[0].reason).toBe('ExitedNormally');
    const container = prisma.getContainerByDockerId('cid-123');
    expect(container?.status).toBe('stopped');
    expect(container?.terminationReason).toBe('ExitedNormally');
  });

  it('treats exitCode 137 with preceding oom as OOMKilled', async () => {
    processor.enqueue(makeEvent({ Action: 'oom', time: 200 }));
    await processor.drain();
    processor.enqueue(makeEvent({ Action: 'die', time: 205, Actor: { ID: 'cid-123', Attributes: { exitCode: '137' } } }));
    await processor.drain();

    expect(prisma.events.at(-1)?.reason).toBe('OOMKilled');
    const container = prisma.getContainerByDockerId('cid-123');
    expect(container?.status).toBe('failed');
  });

  it('treats exitCode 137 without oom as SIGKILL', async () => {
    processor.enqueue(makeEvent({ Action: 'die', time: 300, Actor: { ID: 'cid-123', Attributes: { exitCode: '137' } } }));
    await processor.drain();

    expect(prisma.events.at(-1)?.reason).toBe('SIGKILL');
    const container = prisma.getContainerByDockerId('cid-123');
    expect(container?.status).toBe('failed');
    expect(container?.terminationReason).toBe('SIGKILL');
  });

  it('marks container terminating on kill signal and stopped on subsequent SIGTERM die', async () => {
    processor.enqueue(
      makeEvent({ Action: 'kill', time: 400, Actor: { ID: 'cid-123', Attributes: { signal: 'SIGTERM' } } }),
    );
    await processor.drain();
    let container = prisma.getContainerByDockerId('cid-123');
    expect(prisma.events.at(-1)?.reason).toBe('SIGTERM');
    expect(container?.status).toBe('terminating');

    processor.enqueue(
      makeEvent({ Action: 'die', time: 405, Actor: { ID: 'cid-123', Attributes: { exitCode: '143' } } }),
    );
    await processor.drain();

    container = prisma.getContainerByDockerId('cid-123');
    expect(prisma.events.at(-1)?.reason).toBe('SIGTERM');
    expect(container?.status).toBe('stopped');
    expect(container?.terminationReason).toBe('SIGTERM');
    expect(container?.dockerContainerId).toBe('cid-123');
  });

  it('updates container docker id and thread id from event context', async () => {
    const localPrisma = new FakePrismaClient();
    localPrisma.addContainer({ id: 2, containerId: 'cid-unknown', dockerContainerId: 'stale-id', status: 'running', threadId: null, terminationReason: null });
    const localProcessor = new ContainerEventProcessor(new FakePrismaService(localPrisma));

    const threadId = '11111111-2222-4333-8444-555555555555';
    localProcessor.enqueue(
      makeEvent({
        Action: 'die',
        time: 500,
        id: 'cid-unknown',
        Id: 'cid-unknown',
        Actor: {
          ID: 'cid-unknown',
          Attributes: { exitCode: '0', 'hautech.ai/thread_id': threadId },
        },
      }),
    );
    await localProcessor.drain();

    const container = localPrisma.getContainerByDockerId('cid-unknown');
    expect(container?.dockerContainerId).toBe('cid-unknown');
    expect(container?.threadId).toBe(threadId);
  });
});
