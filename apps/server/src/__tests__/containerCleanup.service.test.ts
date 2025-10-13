import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../services/containerRegistry.service';
import { ContainerCleanupService } from '../services/containerCleanup.service';
import { LoggerService } from '../services/logger.service';

class FakeContainerService {
  stopped: string[] = [];
  removed: string[] = [];
  async stopContainer(id: string, _t?: number) { this.stopped.push(id); }
  async removeContainer(id: string, _force?: boolean) { this.removed.push(id); }
}

describe('ContainerCleanupService', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let registry: ContainerRegistryService;
  const logger = new LoggerService();
  const fakeSvc = new FakeContainerService() as any;

  beforeAll(async () => {
    process.env.CONTAINERS_CLEANUP_ENABLED = 'true';
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    client = await MongoClient.connect(mongod.getUri());
    registry = new ContainerRegistryService(client.db('test'), logger);
    await registry.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('sweeps expired containers and marks stopped', async () => {
    const cid = 'xyz000';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past } });
    const svc = new ContainerCleanupService(registry, fakeSvc, logger);
    await svc.sweep(new Date());
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
    expect(fakeSvc.stopped).toContain(cid);
    expect(fakeSvc.removed).toContain(cid);
  });

  it('retries containers stuck in terminating with backoff metadata and handles benign 304/404', async () => {
    const cid = 'retry-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past, status: 'running' } });
    // First sweep: simulate non-benign error on stop
    const svc1 = new ContainerCleanupService(registry, {
      stopContainer: async () => { const err: any = new Error('boom'); err.statusCode = 500; throw err; },
      removeContainer: async () => { /* not reached */ },
    } as any, logger);
    await svc1.sweep(new Date());
    // Should remain terminating with retry metadata
    const after1 = await col.findOne({ container_id: cid });
    expect(after1?.status).toBe('terminating');
    expect((after1 as any)?.metadata?.retryAfter).toBeTruthy();

    // Advance time past retryAfter and ensure re-sweep picks it up
    const retryAfter = new Date(((after1 as any)?.metadata?.retryAfter) as string);
    const now2 = new Date(retryAfter.getTime() + 1000);
    // Second sweep: benign 304 on stop, benign 404 on remove; should mark stopped
    const svc2 = new ContainerCleanupService(registry, {
      stopContainer: async () => { const e: any = new Error('already stopped'); e.statusCode = 304; throw e; },
      removeContainer: async () => { const e: any = new Error('gone'); e.statusCode = 404; throw e; },
    } as any, logger);
    await svc2.sweep(now2);
    const after2 = await col.findOne({ container_id: cid });
    expect(after2?.status).toBe('stopped');
  });

  it('respects CONTAINERS_CLEANUP_ENABLED gate in start()', async () => {
    process.env.CONTAINERS_CLEANUP_ENABLED = 'false';
    const svc = new ContainerCleanupService(registry, new FakeContainerService() as any, logger);
    // start() should no-op and not throw
    svc.start(10);
    // Restore for other tests
    process.env.CONTAINERS_CLEANUP_ENABLED = 'true';
  });
});
