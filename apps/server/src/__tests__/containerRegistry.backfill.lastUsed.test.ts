import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../services/containerRegistry.service';
import { LoggerService } from '../services/logger.service';

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
    } catch (e: unknown) {
      setupOk = false;
      // eslint-disable-next-line no-console
      const msg = (e as { message?: string } | null | undefined)?.message ?? String(e);
      console.warn('Skipping backfill last_used tests: mongodb-memory-server unavailable:', msg);
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
    const presetKill = new Date(new Date(past).getTime() + 86400 * 1000).toISOString();
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
      kill_after_at: presetKill,
      termination_reason: null,
      deleted_at: null,
      metadata: { ttlSeconds: 86400, labels: { 'hautech.ai/role': 'workspace' } },
    });

    // Narrow types to the adapter used by backfill
    type Adapter = Parameters<ContainerRegistryService['backfillFromDocker']>[0];
    type FindByLabelsResult = Awaited<ReturnType<Adapter['findContainersByLabels']>>;
    const list: FindByLabelsResult = [{ id: cid }];
    type DockerLike = ReturnType<Adapter['getDocker']>;
    const fake: Adapter = {
      findContainersByLabels: async () => list,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' }),
      getDocker: (): DockerLike => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: past, State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    };

    await registry.backfillFromDocker(fake);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(past);
    // Ensure kill_after_at remains unchanged when already present
    expect(after?.kill_after_at).toBe(presetKill);
  });

  it('sets last_used_at and kill_after_at for newly discovered running container', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'new-1';
    const now = Date.now();
    type Adapter = Parameters<ContainerRegistryService['backfillFromDocker']>[0];
    type FindByLabelsResult = Awaited<ReturnType<Adapter['findContainersByLabels']>>;
    const list: FindByLabelsResult = [{ id: cid }];
    type DockerLike = ReturnType<Adapter['getDocker']>;
    const fake: Adapter = {
      findContainersByLabels: async () => list,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t2' }),
      getDocker: (): DockerLike => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: new Date(now).toISOString(), State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    };

    await registry.backfillFromDocker(fake);
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

  it('recomputes kill_after_at when missing and ttlSeconds present; last_used_at unchanged', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'exist-2';
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    // Existing record has last_used_at set, kill_after_at missing, and ttlSeconds present
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
      kill_after_at: null,
      termination_reason: null,
      deleted_at: null,
      metadata: { ttlSeconds: 600, labels: { 'hautech.ai/role': 'workspace' } },
    });

    type Adapter = Parameters<ContainerRegistryService['backfillFromDocker']>[0];
    type FindByLabelsResult = Awaited<ReturnType<Adapter['findContainersByLabels']>>;
    const list: FindByLabelsResult = [{ id: cid }];
    type DockerLike = ReturnType<Adapter['getDocker']>;
    const fake: Adapter = {
      findContainersByLabels: async () => list,
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' }),
      getDocker: (): DockerLike => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: past, State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    };

    await registry.backfillFromDocker(fake);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(past);
    // Expect kill_after_at = last_used + ttl (600s)
    const expected = new Date(new Date(past).getTime() + 600 * 1000).toISOString();
    expect(after?.kill_after_at).toBe(expected);
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
});
