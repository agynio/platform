import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const logger = new LoggerService();
const NODE_ID = 'node-update';

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

describe('MemoryService.update', () => {
  it('updates array elements equal to old_data', async () => {
    const s = await svc('global');
    // seed array
    await s.append('/arr', [1, 2, 1]);
    const r = await s.update('/arr', 1, 9);
    expect(r.updated).toBe(2);
    expect(await s.read('/arr')).toEqual([9, 2, 9]);
  });

  it('updates string by replacing all occurrences', async () => {
    const s = await svc('global');
    await s.append('/s', 'hello');
    await s.append('/s', 'hello');
    const r = await s.update('/s', 'hello', 'hi');
    expect(r.updated).toBe(2);
    expect(await s.read('/s')).toBe('hi\nhi');
  });

  it('shallow updates object values equal to old_data', async () => {
    const s = await svc('global');
    await s.append('/o', { a: 1, b: 1, c: 2 });
    const r = await s.update('/o', 1, 3);
    expect(r.updated).toBe(2);
    expect(await s.read('/o')).toEqual({ a: 3, b: 3, c: 2 });
  });

  it('updates primitive when strictly equal', async () => {
    const s = await svc('global');
    await s.append('/p', 10);
    const r0 = await s.update('/p', 11, 12);
    expect(r0.updated).toBe(0);
    const r1 = await s.update('/p', 10, 20);
    expect(r1.updated).toBe(1);
    expect(await s.read('/p')).toBe(20);
  });

  it('throws on directory', async () => {
    const s = await svc('global');
    await s.ensureDir('/dir');
    await expect(s.update('/dir', 1, 2)).rejects.toThrow();
  });

  it('no-op on missing path', async () => {
    const s = await svc('global');
    const r = await s.update('/missing', 1, 2);
    expect(r.updated).toBe(0);
  });

  it('perThread scoping respected', async () => {
    const s1 = await svc('perThread', 'T1');
    const s2 = await svc('perThread', 'T2');
    await s1.append('/k', [1, 2, 1]);
    const r2 = await s2.update('/k', 1, 9);
    expect(r2.updated).toBe(0);
    const r1 = await s1.update('/k', 1, 9);
    expect(r1.updated).toBe(2);
    expect(await s1.read('/k')).toEqual([9, 2, 9]);
  });
});
