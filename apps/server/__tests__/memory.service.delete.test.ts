import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';

let db: any;
const logger = new LoggerService();
const NODE_ID = 'node-delete';

async function svc(scope: 'global' | 'perThread', threadId?: string) {
  return new MemoryService(db, logger, { nodeId: NODE_ID, scope, threadResolver: () => threadId });
}

beforeAll(async () => {
  const { makeFakeDb } = await import('./helpers/fakeDb');
  db = makeFakeDb().db;
});

afterAll(async () => {
  db = undefined as any;
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
