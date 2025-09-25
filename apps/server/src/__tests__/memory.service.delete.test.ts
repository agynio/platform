import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const logger = new LoggerService();
const NODE_ID = 'node-delete';

async function svc(scope: 'global' | 'perThread', threadId?: string) {
  return new MemoryService(db, logger, { nodeId: NODE_ID, scope, threadResolver: () => threadId });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db('test');
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe('MemoryService.delete', () => {
  it('deletes a file path', async () => {
    const s = await svc('global');
    await s.append('/a/b', 1);
    const res = await s.delete('/a/b');
    expect(res.deleted).toBe(1);
    expect(await s.read('/a/b')).toBeUndefined();
  });

  it('deletes a directory subtree with multiple levels', async () => {
    const s = await svc('global');
    await s.append('/a/b/c', 1);
    await s.append('/a/b/d', 2);
    const res = await s.delete('/a/b');
    expect(res.deleted).toBe(2);
    // b should be gone under a
    const listA = await s.list('/a');
    expect(listA.find((e) => e.name === 'b')).toBeUndefined();
    expect(await s.stat('/a/b')).toEqual({ exists: false, kind: 'missing' });
  });

  it('missing path is a no-op', async () => {
    const s = await svc('global');
    const res = await s.delete('/nope');
    expect(res.deleted).toBe(0);
  });

  it('perThread scoping respected', async () => {
    const s1 = await svc('perThread', 'T1');
    const s2 = await svc('perThread', 'T2');
    await s1.append('/x', 'v');
    const r2 = await s2.delete('/x');
    expect(r2.deleted).toBe(0);
    const r1 = await s1.delete('/x');
    expect(r1.deleted).toBe(1);
  });
});
