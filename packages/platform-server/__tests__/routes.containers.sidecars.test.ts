import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ContainersController } from '../src/infra/container/containers.controller';
import type { PrismaService } from '../src/core/services/prisma.service';
import { LoggerService } from '../src/core/services/logger.service';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import type { PrismaClient } from '@prisma/client';

type MinimalPrismaClient = { container: { findMany: (args?: unknown) => Promise<unknown[]> } };
class PrismaStub { private client: MinimalPrismaClient = { container: { findMany: async () => [] } }; getClient(): MinimalPrismaClient { return this.client; } }

// Minimal typed interface for test Fastify usage
interface TestFastify {
  inject: (opts: { method: string; url: string }) => Promise<{ statusCode: number; body: string }>;
  get: (
    path: string,
    handler: (req: { params: unknown }, res: { send: (payload: unknown) => unknown }) => unknown,
  ) => void;
}

describe('ContainersController sidecars route', () => {
  let fastify: TestFastify; let controller: ContainersController;

  class FakeDocker {
    private data: Record<string, any>;
    constructor(data: Record<string, any>) { this.data = data; }
    getContainer(id: string) { return { inspect: async () => this.data[id] || {} }; }
  }

  class FakeContainerService extends ContainerService {
    private docker: FakeDocker;
    constructor(private items: Array<{ id: string }>, inspectMap: Record<string, any>) {
      const dummyPrisma = {} as unknown as PrismaClient;
      const logger = new LoggerService();
      super(logger, new ContainerRegistry(dummyPrisma, logger));
      this.docker = new FakeDocker(inspectMap);
    }
    override async findContainersByLabels(): Promise<Array<{ id: string }>> { return this.items; }
    override getDocker() { return this.docker; }
  }

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    const parentId = 'parent-123';
    const sideId = 'side-abc';
    const fakeInspect = {
      Id: sideId,
      Created: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      Config: { Image: 'docker:27-dind', Labels: { 'hautech.ai/parent_cid': parentId } },
      State: { Running: true },
    };
    controller = new ContainersController(
      new PrismaStub() as unknown as PrismaService,
      new FakeContainerService([{ id: sideId }], { [sideId]: fakeInspect }),
      new LoggerService(),
    );
    fastify.get('/api/containers/:id/sidecars', async (req, res) => {
      const id = (req.params as { id: string }).id;
      return res.send(await controller.listSidecars(id));
    });
  });

  it('returns sidecars for a parent container', async () => {
    const parentId = 'parent-123';
    const res = await fastify.inject({ method: 'GET', url: `/api/containers/${parentId}/sidecars` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ containerId: string; parentContainerId: string; role: string; image: string; status: string; startedAt: string }>; };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1);
    const sc = body.items[0];
    expect(sc.role).toBe('dind');
    expect(sc.parentContainerId).toBe('parent-123');
    expect(sc.status).toBe('running');
    expect(sc.image).toBe('docker:27-dind');
  });

  it('handles inspect failures gracefully and returns empty items', async () => {
    const parentId = 'parent-err';
    const badId = 'bad-sidecar';
    class ThrowDocker {
      getContainer(_id: string) {
        return { inspect: async () => { throw new Error('boom'); } };
      }
    }
    class ThrowService extends ContainerService {
      private docker = new ThrowDocker();
      constructor() {
        const dummyPrisma = {} as unknown as PrismaClient;
        const logger = new LoggerService();
        super(logger, new ContainerRegistry(dummyPrisma, logger));
      }
      override async findContainersByLabels() { return [{ id: badId }]; }
      override getDocker() { return this.docker; }
    }
    const ctrl = new ContainersController(
      new PrismaStub() as unknown as PrismaService,
      new ThrowService(),
      new LoggerService(),
    );
    const fastify2 = Fastify({ logger: false });
    fastify2.get('/api/containers/:id/sidecars', async (req, res) => {
      const id = (req.params as { id: string }).id;
      return res.send(await ctrl.listSidecars(id));
    });
    const res = await fastify2.inject({ method: 'GET', url: `/api/containers/${parentId}/sidecars` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<unknown> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });

  it('falls back to parent id when label missing or invalid', async () => {
    const parentId = 'parent-fallback';
    const sideId = 'side-fallback';
    const fakeInspect = {
      Id: sideId,
      Created: new Date('2024-02-01T00:00:00.000Z').toISOString(),
      // Missing parent_cid; include an invalid type for unrelated key to ensure zod parsing is safe
      Config: { Image: 'docker:27-dind', Labels: { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': 123 } },
      State: { Running: false },
    };
    const ctrl = new ContainersController(
      new PrismaStub() as unknown as PrismaService,
      new FakeContainerService([{ id: sideId }], { [sideId]: fakeInspect }),
      new LoggerService(),
    );
    const fastify2 = Fastify({ logger: false });
    fastify2.get('/api/containers/:id/sidecars', async (req, res) => {
      const id = (req.params as { id: string }).id;
      return res.send(await ctrl.listSidecars(id));
    });
    const res = await fastify2.inject({ method: 'GET', url: `/api/containers/${parentId}/sidecars` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ parentContainerId: string; status: string }> };
    expect(body.items[0].parentContainerId).toBe(parentId);
    expect(body.items[0].status).toBe('stopped');
  });
});
