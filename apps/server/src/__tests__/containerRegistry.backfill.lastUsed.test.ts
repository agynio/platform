import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../services/containerRegistry.service';
import { LoggerService } from '../services/logger.service';
import type { ContainerService } from '../services/container.service';
import type Docker from 'dockerode';

describe('ContainerRegistryService backfill last_used behavior', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let registry: ContainerRegistryService;
  const logger = new LoggerService();
  let setupOk = true;

  beforeAll(async () => {
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());
      registry = new ContainerRegistryService(client.db('test'), logger);
      await registry.ensureIndexes();
    } catch (e: any) {
      setupOk = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping backfill last_used tests: mongodb-memory-server unavailable:', e?.message || e);
    }
  });

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
    if (mongod) await mongod.stop().catch(() => {});
  });

  it('does not modify last_used_at for existing running container on backfill', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'exist-1';
    const past = new Date(Date.now() - 60_000).toISOString();
    const precomputedKillAfter = new Date(new Date(past).getTime() + 86400 * 1000).toISOString();
    await col.insertOne({
      container_id: cid,
      node_id: 'n',
      thread_id: 't',
      provider_type: 'docker',
      image: 'img',
      status: 'running',
      created_at: past,
      updated_at: past,
      last_used_at: past,
      kill_after_at: precomputedKillAfter,
      termination_reason: null,
      deleted_at: null,
      metadata: { ttlSeconds: 86400, labels: { 'hautech.ai/role': 'workspace' } },
    });

    type MockSvc = Pick<ContainerService, 'findContainersByLabels' | 'getContainerLabels' | 'getDocker'>;
    const dockerLike: Pick<Docker, 'getContainer'> = {
      getContainer: (_id: string) => ({
        inspect: async () => ({ Created: past, State: { Running: true }, Config: { Image: 'img' } }),
      }) as unknown as Docker.Container,
    } as unknown as Pick<Docker, 'getContainer'>;
    const fake: MockSvc = {
      findContainersByLabels: async () => [{ id: cid }] as unknown as any,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' }),
      getDocker: () => dockerLike as unknown as Docker,
    };

    await registry.backfillFromDocker(fake as unknown as ContainerService);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(past);
    // Ensure we didn't null out or change kill_after_at when it already existed
    expect(after?.kill_after_at).toBe(precomputedKillAfter);
  });

  it('sets last_used_at and kill_after_at for newly discovered running container', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'new-1';
    const now = Date.now();
    type MockSvc = Pick<ContainerService, 'findContainersByLabels' | 'getContainerLabels' | 'getDocker'>;
    const createdIso = new Date(now).toISOString();
    const dockerLike: Pick<Docker, 'getContainer'> = {
      getContainer: (_id: string) => ({
        inspect: async () => ({ Created: createdIso, State: { Running: true }, Config: { Image: 'img' } }),
      }) as unknown as Docker.Container,
    } as unknown as Pick<Docker, 'getContainer'>;
    const fake: MockSvc = {
      findContainersByLabels: async () => [{ id: cid }] as unknown as any,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t2' }),
      getDocker: () => dockerLike as unknown as Docker,
    };

    await registry.backfillFromDocker(fake as unknown as ContainerService);
    const doc = await col.findOne({ container_id: cid });
    expect(doc).toBeTruthy();
    expect(typeof doc!.last_used_at).toBe('string');
    expect(doc!.kill_after_at).toBeTruthy();
    const lu = new Date(doc!.last_used_at).getTime();
    const ka = new Date(doc!.kill_after_at!).getTime();
    // last_used_at should be roughly now (within 5s)
    expect(Math.abs(lu - now)).toBeLessThan(5000);
    // kill_after ~ last_used + 86400s (allow 5s slop)
    expect(Math.abs(ka - (lu + 86400 * 1000))).toBeLessThan(5000);
  });

  it('touchLastUsed path still updates last_used_at', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'touch-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'img' });
    const before = await col.findOne({ container_id: cid });
    const future = new Date(Date.now() + 12345);
    await registry.updateLastUsed(cid, future);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(future.toISOString());
    expect(after?.kill_after_at).toBeTruthy();
    expect(after?.kill_after_at).not.toBe(before?.kill_after_at);
  });

  it('recomputes kill_after_at when missing and ttlSeconds present, preserving last_used_at', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'recompute-1';
    const lastUsed = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const ttl = 3600; // 1 hour

    await col.insertOne({
      container_id: cid,
      node_id: 'n',
      thread_id: 't',
      provider_type: 'docker',
      image: 'img',
      status: 'running',
      created_at: lastUsed,
      updated_at: lastUsed,
      last_used_at: lastUsed,
      kill_after_at: null,
      termination_reason: null,
      deleted_at: null,
      metadata: { ttlSeconds: ttl, lastError: 'x', retryAfter: new Date(Date.now() + 1000).toISOString(), terminationAttempts: 2, labels: { 'hautech.ai/role': 'workspace' } },
    });

    // expected recompute from last_used_at + ttl
    const expectedKillAfter = new Date(new Date(lastUsed).getTime() + ttl * 1000).toISOString();

    type MockSvc = Pick<ContainerService, 'findContainersByLabels' | 'getContainerLabels' | 'getDocker'>;
    const dockerLike: Pick<Docker, 'getContainer'> = {
      getContainer: (_id: string) => ({
        inspect: async () => ({ Created: lastUsed, State: { Running: true }, Config: { Image: 'img' } }),
      }) as unknown as Docker.Container,
    } as unknown as Pick<Docker, 'getContainer'>;
    const fake: MockSvc = {
      findContainersByLabels: async () => [{ id: cid }] as unknown as any,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' }),
      getDocker: () => dockerLike as unknown as Docker,
    };

    await registry.backfillFromDocker(fake as unknown as ContainerService);
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.last_used_at).toBe(lastUsed);
    expect(doc?.kill_after_at).toBe(expectedKillAfter);
    // assert metadata fields unrelated to labels/platform/ttlSeconds are preserved
    expect(doc?.metadata?.lastError).toBe('x');
    expect(doc?.metadata?.terminationAttempts).toBe(2);
  });
});
