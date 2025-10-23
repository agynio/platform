import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../src/services/containerRegistry.service';
import { ContainerCleanupService } from '../src/services/containerCleanup.service';
import { LoggerService } from '../src/core/services/logger.service';

class FakeContainerService {
  stopped: string[] = [];
  removed: string[] = [];
  async stopContainer(id: string, _t?: number) { this.stopped.push(id); }
  async removeContainer(id: string, _force?: boolean) { this.removed.push(id); }
  async findContainersByLabels(_labels: Record<string,string>) { return []; }
}

describe('ContainerCleanupService', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let registry: ContainerRegistryService;
  const logger = new LoggerService();
  const fakeSvc = new FakeContainerService() as any;
  let setupOk = true;

  beforeAll(async () => {
    process.env.CONTAINERS_CLEANUP_ENABLED = 'true';
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());
      registry = new ContainerRegistryService(client.db('test'), logger);
      await registry.ensureIndexes();
    } catch (e: any) {
      // common in environments without AVX support
      setupOk = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping ContainerCleanupService tests: mongodb-memory-server unavailable:', e?.message || e);
    }
  });

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
    if (mongod) await mongod.stop().catch(() => {});
  });

  it('sweeps expired containers and marks stopped', async () => {
    if (!setupOk) return;
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
    if (!setupOk) return;
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

  it('treats 409 on remove as benign and marks stopped without recording failure', async () => {
    if (!setupOk) return;
    const cid = 'rminprog-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past, status: 'running' } });
    const svc = new ContainerCleanupService(
      registry,
      {
        stopContainer: async () => { /* ok */ },
        removeContainer: async () => { const e: any = new Error('removing'); e.statusCode = 409; throw e; },
      } as any,
      logger,
    );
    await svc.sweep(new Date());
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
    // No termination failure metadata should be present
    expect((doc as any)?.metadata?.terminationAttempts).toBeUndefined();
    expect((doc as any)?.metadata?.lastError).toBeUndefined();
    expect((doc as any)?.metadata?.retryAfter).toBeUndefined();
  });

  it('treats 409 on stop as benign and proceeds to removal', async () => {
    if (!setupOk) return;
    const cid = 'stopinprog-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past, status: 'running' } });
    const svc = new ContainerCleanupService(
      registry,
      {
        stopContainer: async () => { const e: any = new Error('conflict'); e.statusCode = 409; throw e; },
        removeContainer: async () => { const gone: any = new Error('gone'); gone.statusCode = 404; throw gone; },
        findContainersByLabels: async () => [],
      } as any,
      logger,
    );
    await svc.sweep(new Date());
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
  });

  it('respects CONTAINERS_CLEANUP_ENABLED gate in start()', async () => {
    if (!setupOk) return;
    process.env.CONTAINERS_CLEANUP_ENABLED = 'false';
    const svc = new ContainerCleanupService(registry, new FakeContainerService() as any, logger);
    // start() should no-op and not throw
    svc.start(10);
    // Restore for other tests
    process.env.CONTAINERS_CLEANUP_ENABLED = 'true';
  });

  it('removes associated DinD sidecars before workspace removal', async () => {
    if (!setupOk) return;
    const cid = 'with-dind-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past, status: 'running' } });
    const sidecarOps: string[] = [];
    const fake = {
      stopContainer: async (_id: string) => {},
      removeContainer: async (_id: string) => {},
      findContainersByLabels: async (labels: Record<string,string>) => {
        expect(labels['hautech.ai/role']).toBe('dind');
        expect(labels['hautech.ai/parent_cid']).toBe(cid);
        return [
          { stop: async () => { sidecarOps.push('sc1.stop'); }, remove: async () => { sidecarOps.push('sc1.remove'); } },
          { stop: async () => { sidecarOps.push('sc2.stop'); }, remove: async () => { sidecarOps.push('sc2.remove'); } },
        ];
      },
    } as any;
    const svc = new ContainerCleanupService(registry, fake, logger);
    await svc.sweep(new Date());
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
    expect(sidecarOps).toEqual(expect.arrayContaining(['sc1.stop','sc1.remove','sc2.stop','sc2.remove']));
  });
});
