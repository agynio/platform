import { beforeEach, describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { ContainerEventProcessor } from '../src/infra/container/containerEvent.processor';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import type { ContainerStatus, ContainerEventType } from '@prisma/client';
import type { ContainerService } from '../src/infra/container/container.service';

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
  private byDockerId = new Map<string, ContainerRow>();
  events: ContainerEventRow[] = [];

  addContainer(row: ContainerRow) {
    this.containers.set(row.id, { ...row });
    this.byDockerId.set(row.containerId, { ...row });
    if (row.dockerContainerId) this.byDockerId.set(row.dockerContainerId, { ...row });
  }

  getContainer(id: string): ContainerRow | undefined {
    for (const row of this.containers.values()) {
      if (row.containerId === id || row.dockerContainerId === id) return { ...row };
    }
    const row = this.byDockerId.get(id);
    return row ? { ...row } : undefined;
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
        row.terminationReason = typeof data.terminationReason === 'string'
          ? data.terminationReason
          : (data.terminationReason as { set: string | null }).set ?? row.terminationReason;
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
      this.containers.set(id, { ...row });
      this.byDockerId.set(row.containerId, { ...row });
      if (row.dockerContainerId) this.byDockerId.set(row.dockerContainerId, { ...row });
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

  private pick(row: ContainerRow, select: Record<string, boolean> | undefined): Partial<ContainerRow> {
    if (!select) return { ...row };
    const out: Partial<ContainerRow> = {};
    for (const [key, value] of Object.entries(select)) {
      if (!value) continue;
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

class FakeDocker {
  constructor(private readonly stream: PassThrough) {}
  getEvents(_opts: unknown, cb: (err?: Error, stream?: PassThrough) => void) {
    cb(undefined, this.stream);
  }
}

class FakeContainerService {
  constructor(private readonly docker: FakeDocker) {}
  getDocker(): FakeDocker {
    return this.docker;
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
    prisma.addContainer({ id: 1, containerId: 'cid-abc', dockerContainerId: 'cid-abc', status: 'running', threadId: null, terminationReason: null });
    stream = new PassThrough();
    processor = new ContainerEventProcessor(new FakePrismaService(prisma));
    const docker = new FakeDocker(stream);
    const containerService = new FakeContainerService(docker);
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
});
