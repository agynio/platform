import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ContainersController } from '../src/infra/container/containers.controller';
import type { PrismaService } from '../src/core/services/prisma.service';
import { LoggerService } from '../src/core/services/logger.service';

class PrismaStub { getClient() { return { container: { findMany: async () => [] } } as any; } }

describe('ContainersController sidecars route', () => {
  let fastify: any; let controller: ContainersController;

  class FakeDocker {
    private data: Record<string, any>;
    constructor(data: Record<string, any>) { this.data = data; }
    getContainer(id: string) { return { inspect: async () => this.data[id] || {} }; }
  }

  class FakeContainerService {
    private docker: FakeDocker;
    constructor(private items: Array<{ id: string }>, inspectMap: Record<string, any>) { this.docker = new FakeDocker(inspectMap); }
    async findContainersByLabels(): Promise<Array<{ id: string }>> { return this.items; }
    getDocker() { return this.docker; }
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
      new FakeContainerService([{ id: sideId }], { [sideId]: fakeInspect }) as any,
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
    const body = res.json() as { items: Array<{ containerId: string; parentContainerId: string; role: string; image: string; status: string; startedAt: string }>; };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1);
    const sc = body.items[0];
    expect(sc.role).toBe('dind');
    expect(sc.parentContainerId).toBe(parentId);
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
    class ThrowService extends (class {} as { new (): any }) {
      private docker = new ThrowDocker();
      async findContainersByLabels() { return [{ id: badId }]; }
      getDocker() { return this.docker; }
    }
    const ctrl = new ContainersController(
      new PrismaStub() as unknown as PrismaService,
      new ThrowService() as any,
      new LoggerService(),
    );
    const fastify2 = Fastify({ logger: false });
    fastify2.get('/api/containers/:id/sidecars', async (req, res) => {
      const id = (req.params as { id: string }).id;
      return res.send(await ctrl.listSidecars(id));
    });
    const res = await fastify2.inject({ method: 'GET', url: `/api/containers/${parentId}/sidecars` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<unknown> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });
});
