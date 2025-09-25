import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const logger = new LoggerService();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db('test');
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe('MemoryService hardening', () => {
  it('creates idempotent partial unique indexes for global and perThread', async () => {
    const s = new MemoryService(db, logger, { nodeId: 'idx', scope: 'global', threadResolver: () => undefined });
    await s.stat('/'); // trigger index creation
    const indexes = await db.collection('memories').listIndexes().toArray();
    const hasPerThread = indexes.find((i) => i.name === 'memories_unique_per_thread');
    const hasGlobal = indexes.find((i) => i.name === 'memories_unique_global');
    expect(hasPerThread).toBeTruthy();
    expect(hasGlobal).toBeTruthy();
    expect(hasPerThread!.partialFilterExpression).toEqual({ threadId: { $exists: true } });
    expect(hasGlobal!.partialFilterExpression).toEqual({ threadId: { $exists: false } });

    // Idempotent re-run
    await s.stat('/');
  });

  it('enforces uniqueness: one doc per (nodeId,scope) without thread and per (nodeId,scope,threadId) with thread', async () => {
    const coll = db.collection('memories');
    // Ensure indexes exist
    const s1 = new MemoryService(db, logger, { nodeId: 'uniq', scope: 'global', threadResolver: () => undefined });
    await s1.stat('/');

    await coll.insertOne({ nodeId: 'uniqA', scope: 'global', data: {} });
    await expect(coll.insertOne({ nodeId: 'uniqA', scope: 'global', data: {} })).rejects.toHaveProperty('code', 11000);

    await coll.insertOne({ nodeId: 'uniqB', scope: 'perThread', threadId: 'T1', data: {} });
    await expect(coll.insertOne({ nodeId: 'uniqB', scope: 'perThread', threadId: 'T1', data: {} })).rejects.toHaveProperty(
      'code',
      11000,
    );
    // Different threadId is allowed
    await coll.insertOne({ nodeId: 'uniqB', scope: 'perThread', threadId: 'T2', data: {} });
  });

  it('rejects invalid paths with clear messages and missing threadId errors', async () => {
    const s = new MemoryService(db, logger, { nodeId: 'path', scope: 'global', threadResolver: () => undefined });
    await expect(s.append('/bad//path', 1)).rejects.toThrow(/invalid path/i);
    await expect(s.append('/bad/..', 1)).rejects.toThrow(/cannot contain/i);
    await expect(s.append('/bad/$d', 1)).rejects.toThrow(/invalid.*segment/i);
    await expect(s.append('/bad/seg!', 1)).rejects.toThrow(/invalid.*segment/i);

    const s2 = new MemoryService(db, logger, { nodeId: 'pth2', scope: 'perThread', threadResolver: () => undefined });
    await expect(s2.stat('/')).rejects.toThrow(/threadId is required/i);
  });
});
