import { beforeEach, describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { ContainerEventProcessor } from '../src/infra/container/containerEvent.processor';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import type { ContainerStatus, ContainerEventType } from '@prisma/client';
import type { ContainerService } from '@agyn/docker-runner';
import type { GetEventsOptions } from 'dockerode';

type ContainerRow = {
  id: number;
  containerId: string;
  dockerContainerId: string | null;
  status: ContainerStatus;
  threadId: string | null;
  terminationReason: string | null;
  metadata: Record<string, unknown> | null;
};

type ContainerEventRow = {
  containerDbId: number;
  eventType: ContainerEventType;
  exitCode: number | null;
  signal: string | null;
  reason: string | null;
  message: string | null;
  createdAt: Date;
  health: string | null;
};

class FakePrismaClient {
  private containers = new Map<number, ContainerRow>();
  private byDockerId = new Map<string, ContainerRow>();
  events: ContainerEventRow[] = [];

  addContainer(row: ContainerRow) {
    const metadata = row.metadata ?? { lastEventAt: new Date(0).toISOString() };
    const stored = this.cloneRow({ ...row, metadata });
    this.containers.set(stored.id, stored);
    this.byDockerId.set(stored.containerId, this.cloneRow(stored));
    if (stored.dockerContainerId) this.byDockerId.set(stored.dockerContainerId, this.cloneRow(stored));
  }

  getContainer(id: string): ContainerRow | undefined {
    for (const row of this.containers.values()) {
      if (row.containerId === id || row.dockerContainerId === id) return this.cloneRow(row);
    }
    const row = this.byDockerId.get(id);
    return row ? this.cloneRow(row) : undefined;
  }

  container = {
    findUnique: async (args: Parameters<PrismaClient['container']['findUnique']>[0]) => {
      if (!args) return null;
      if (args.where?.containerId) {
        const row = this.byDockerId.get(args.where.containerId);
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
          const row = this.byDockerId.get(clause.containerId);
          if (row) return this.pick(row, args.select);
        }
        if (clause.dockerContainerId) {
          const row = this.byDockerId.get(clause.dockerContainerId);
          if (row) return this.pick(row, args.select);
        }
      }
      if (where.containerId) {
        const row = this.byDockerId.get(where.containerId);
        if (row) return this.pick(row, args.select);
      }
      if (where.dockerContainerId) {
        const row = this.byDockerId.get(where.dockerContainerId);
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
        row.status = (typeof data.status === 'string' ? data.status : (data.status as { set: ContainerStatus }).set) as ContainerStatus;
      }
      if ('terminationReason' in data) {
        const raw = (data as Record<string, unknown>).terminationReason;
        let nextReason: string | null | undefined;
        if (raw === null) {
          nextReason = null;
        } else if (typeof raw === 'string') {
          nextReason = raw;
        } else if (raw && typeof raw === 'object' && 'set' in raw) {
          nextReason = (raw as { set: string | null }).set;
        }
        if (nextReason !== undefined) {
          row.terminationReason = nextReason;
        }
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
      const nextMetadata = (data as Record<string, unknown>).metadata;
      if (nextMetadata && typeof nextMetadata === 'object') {
        row.metadata = this.cloneMetadata(nextMetadata);
      }
      this.containers.set(id, this.cloneRow(row));
      this.byDockerId.set(row.containerId, this.cloneRow(row));
      if (row.dockerContainerId) this.byDockerId.set(row.dockerContainerId, this.cloneRow(row));
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
        health: data.health ?? null,
      };
      this.events.push(row);
      return row;
    },
  };

  private cloneRow(row: ContainerRow): ContainerRow {
    return {
      ...row,
      metadata: row.metadata ? this.cloneMetadata(row.metadata) : null,
    };
  }

  private cloneMetadata(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return JSON.parse(JSON.stringify(value));
    }
    return {};
  }

  private pick(row: ContainerRow, select: Record<string, boolean> | undefined): Partial<ContainerRow> {
    if (!select) return this.cloneRow(row);
    const out: Partial<ContainerRow> = {};
    for (const [key, value] of Object.entries(select)) {
      if (!value) continue;
      const k = key as keyof ContainerRow;
      if (k === 'metadata') {
        out[k] = row.metadata ? this.cloneMetadata(row.metadata) : null;
      } else {
        out[k] = row[k];
      }
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

class FakeContainerService {
  constructor(private readonly stream: PassThrough) {}

  async getEventsStream(_options: { since?: number; filters?: GetEventsOptions['filters'] }): Promise<PassThrough> {
    return this.stream;
  }
}

const writeEvent = (stream: PassThrough, payload: unknown) => {
  stream.write(`${JSON.stringify(payload)}\n`);
};

describe('DockerWorkspaceEventsWatcher integration', () => {
  let prisma: FakePrismaClient;
  let processor: ContainerEventProcessor;
  let stream: PassThrough;
  let watcher: DockerWorkspaceEventsWatcher;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    prisma.addContainer({
      id: 1,
      containerId: 'cid-abc',
      dockerContainerId: 'cid-abc',
      status: 'running',
      threadId: null,
      terminationReason: null,
      metadata: { lastEventAt: new Date(0).toISOString() },
    });
    stream = new PassThrough();
    processor = new ContainerEventProcessor(new FakePrismaService(prisma));
    const containerService = new FakeContainerService(stream);
    watcher = new DockerWorkspaceEventsWatcher(containerService as unknown as ContainerService, processor);
    watcher.start();
  });

  afterEach(async () => {
    watcher.stop();
    await processor.drain();
  });

  it('records SIGTERM kill followed by die event', async () => {
    writeEvent(stream, {
      status: 'kill',
      Action: 'kill',
      Type: 'container',
      id: 'cid-abc',
      time: 100,
      Actor: { ID: 'cid-abc', Attributes: { signal: 'SIGTERM' } },
    });
    await processor.drain();

    let container = prisma.getContainer('cid-abc');
    expect(prisma.events.at(-1)?.reason).toBe('SIGTERM');
    expect(container?.status).toBe('terminating');

    writeEvent(stream, {
      status: 'die',
      Action: 'die',
      Type: 'container',
      id: 'cid-abc',
      time: 105,
      Actor: { ID: 'cid-abc', Attributes: { exitCode: '143' } },
    });
    await processor.drain();

    container = prisma.getContainer('cid-abc');
    expect(prisma.events.at(-1)?.reason).toBe('SIGTERM');
    expect(container?.status).toBe('stopped');
    expect(container?.terminationReason).toBe('SIGTERM');
    expect(container?.dockerContainerId).toBe('cid-abc');
  });

  it('records die exitCode 137 as SIGKILL when no oom event', async () => {
    writeEvent(stream, {
      status: 'die',
      Action: 'die',
      Type: 'container',
      id: 'cid-abc',
      time: 200,
      Actor: { ID: 'cid-abc', Attributes: { exitCode: '137' } },
    });
    await processor.drain();

    const container = prisma.getContainer('cid-abc');
    expect(prisma.events.at(-1)?.reason).toBe('SIGKILL');
    expect(container?.status).toBe('failed');
  });

  it('records die exitCode 137 as OOMKilled when preceded by oom', async () => {
    writeEvent(stream, {
      status: 'oom',
      Action: 'oom',
      Type: 'container',
      id: 'cid-abc',
      time: 300,
      Actor: { ID: 'cid-abc', Attributes: {} },
    });
    await processor.drain();

    writeEvent(stream, {
      status: 'die',
      Action: 'die',
      Type: 'container',
      id: 'cid-abc',
      time: 305,
      Actor: { ID: 'cid-abc', Attributes: { exitCode: '137' } },
    });
    await processor.drain();

    const container = prisma.getContainer('cid-abc');
    expect(prisma.events.at(-1)?.reason).toBe('OOMKilled');
    expect(container?.status).toBe('failed');
    expect(container?.terminationReason).toBe('OOMKilled');
  });

  it('tracks health status updates without changing running state', async () => {
    writeEvent(stream, {
      status: 'health_status: healthy',
      Action: 'health_status',
      Type: 'container',
      id: 'cid-abc',
      time: 400,
      Actor: { ID: 'cid-abc', Attributes: { health_status: 'healthy' } },
    });
    await processor.drain();

    const container = prisma.getContainer('cid-abc');
    expect(container?.status).toBe('running');
    expect(container?.terminationReason).toBeNull();
    expect((container?.metadata as Record<string, unknown> | undefined)?.health).toBe('healthy');
    expect(prisma.events.at(-1)?.reason).toBe('HealthStatusHealthy');
  });

  it('marks containers as autoRemoved on destroy event', async () => {
    writeEvent(stream, {
      status: 'die',
      Action: 'die',
      Type: 'container',
      id: 'cid-abc',
      time: 500,
      Actor: { ID: 'cid-abc', Attributes: { exitCode: '0' } },
    });
    await processor.drain();

    writeEvent(stream, {
      status: 'destroy',
      Action: 'destroy',
      Type: 'container',
      id: 'cid-abc',
      time: 505,
      Actor: { ID: 'cid-abc', Attributes: { autoRemove: '1' } },
    });
    await processor.drain();

    const container = prisma.getContainer('cid-abc');
    expect((container?.metadata as Record<string, unknown> | undefined)?.autoRemoved).toBe(true);
    expect(container?.status).toBe('stopped');
    expect(prisma.events.at(-1)?.reason).toBe('ContainerDestroyed');
  });
});
