import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const logger = new LoggerService();

const NODE_ID = 'node-x';

async function createSvc(scope: 'global' | 'perThread', threadId?: string) {
  return new MemoryService(db, logger, {
    nodeId: NODE_ID,
    scope,
    threadResolver: () => threadId,
  });
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

describe('MemoryService readonly operations', () => {
  it('normalizePath handles slashes and trims', async () => {
    const svc = await createSvc('global');
    // @ts-expect-error accessing helper for test
    expect(svc._normalizePath('/a/b/c')).toBe('a.b.c');
    // @ts-expect-error accessing helper for test
    expect(svc._normalizePath('/a//b/ c ')).toBe('a.b.c');
  });

  it('stat/read/list/ensureDir for global scope', async () => {
    const svc = await createSvc('global');
    const col = db.collection('memories');
    await col.deleteMany({});
    await col.insertOne({ nodeId: NODE_ID, scope: 'global', data: { a: { b: 1 }, folder: { child: 2 }, x: 5 } });

    const sRoot = await svc.stat('/');
    expect(sRoot?.kind).toBe('dir');

    const sA = await svc.stat('/a');
    expect(sA?.kind).toBe('dir');
    const sAB = await svc.stat('/a/b');
    expect(sAB?.kind).toBe('file');
    const sMissing = await svc.stat('/none');
    expect(sMissing?.kind).toBe('missing');

    const readFile = await svc.read('/a/b');
    expect(readFile).toBe(1);

    const readDir = (await svc.read('/')) as Record<string, { kind: string }>;
    expect(readDir.a.kind).toBe('dir');
    expect(readDir.folder.kind).toBe('dir');
    expect(readDir.x.kind).toBe('file');

    const listRoot = await svc.list('/');
    const names = listRoot.map((e) => e.name).sort();
    expect(names).toEqual(['a', 'folder', 'x']);

    await svc.ensureDir('/new/dir');
    const sNew = await svc.stat('/new');
    expect(sNew?.kind).toBe('dir');
    const listNew = await svc.list('/new');
    expect(listNew.map((e) => e.name)).toEqual(['dir']);
  });

  it('perThread scoping isolates data', async () => {
    const svc1 = await createSvc('perThread', 'T1');
    const svc2 = await createSvc('perThread', 'T2');
    const col = db.collection('memories');
    await col.deleteMany({});
    await col.insertOne({ nodeId: NODE_ID, scope: 'perThread', threadId: 'T1', data: { a: 1 } });

    expect((await svc1.read('/a'))).toBe(1);
    expect(await svc2.read('/a')).toBeUndefined();
  });

  it('index creation is idempotent', async () => {
    const svc = await createSvc('global');
    await svc.stat('/');
    await svc.stat('/');
  });
});
