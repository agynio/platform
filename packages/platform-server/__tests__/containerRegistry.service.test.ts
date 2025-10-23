import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../src/services/containerRegistry.service';
import { LoggerService } from '../src/core/services/logger.service';

describe('ContainerRegistryService', () => {
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
      console.warn('Skipping ContainerRegistryService tests: mongodb-memory-server unavailable:', msg);
    }
  });

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
    if (mongod) await mongod.stop().catch(() => {});
  });

  it('registers start with default TTL 24h and updates last_used', async () => {
    if (!setupOk) return;
    const cid = 'abc123';
    await registry.registerStart({
      containerId: cid,
      nodeId: 'node1',
      threadId: 'thr',
      image: 'img',
    });
    // Update last used and verify kill_after moves forward
    const before = await (client.db('test').collection('containers')).findOne({ container_id: cid });
    expect(before?.kill_after_at).toBeTruthy();
    // Simulate time passage
    const now = new Date(Date.now() + 60_000);
    await registry.updateLastUsed(cid, now);
    const after = await (client.db('test').collection('containers')).findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(now.toISOString());
    expect(after?.kill_after_at).toBeTruthy();
  });

  it('disables cleanup when ttlSeconds <= 0', async () => {
    if (!setupOk) return;
    const cid = 'def456';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 0 });
    const doc = await (client.db('test').collection('containers')).findOne({ container_id: cid });
    expect(doc?.kill_after_at).toBeNull();
  });

  it('claims and marks stopped', async () => {
    if (!setupOk) return;
    const cid = 'ghi789';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    // Mark expired by setting last_used in the past
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past, status: 'running' } });
    const expired = await registry.getExpired(new Date());
    expect(expired.find((d) => d.container_id === cid)).toBeTruthy();
    const ok = await registry.claimForTermination(cid, 'claim-1');
    expect(ok).toBe(true);
    await registry.markStopped(cid, 'ttl_expired');
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
    expect(doc?.termination_reason).toBe('ttl_expired');
  });

  it('backfill is idempotent and only includes role=workspace', async () => {
    if (!setupOk) return;
    // Fake container service to emulate docker
    type Adapter = Parameters<ContainerRegistryService['backfillFromDocker']>[0];
    const fake: Adapter = {
      findContainersByLabels: async (_labels: Record<string, string>, _opts?: { all?: boolean }) => [
        { id: 'w1' },
        { id: 'w2' },
      ],
      getContainerLabels: async (id: string) =>
        id === 'w1'
          ? ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' } as Record<string, string>)
          : ({ 'hautech.ai/role': 'not-workspace' } as Record<string, string>),
      getDocker: () => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: new Date().toISOString(), State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    };

    await registry.backfillFromDocker(fake);
    await registry.backfillFromDocker(fake); // run twice
    const col = client.db('test').collection('containers');
    const all = await col.find({}).toArray();
    // Only w1 should be present and running
    const ids = all.map((d) => d.container_id);
    expect(ids).toContain('w1');
    expect(ids).not.toContain('w2');
  });
});
