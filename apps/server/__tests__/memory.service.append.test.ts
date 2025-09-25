import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';

let db: any;
const logger = new LoggerService();
const NODE_ID = 'node-append';

async function svc(scope: 'global' | 'perThread', threadId?: string) {
  return new MemoryService(db, logger, { nodeId: NODE_ID, scope, threadResolver: () => threadId });
}

// Use in-memory fake Db instead of mongodb-memory-server
beforeAll(async () => {
  const { makeFakeDb } = await import('./helpers/fakeDb');
  db = makeFakeDb().db;
});

afterAll(async () => {
  db = undefined as any;
});

describe('MemoryService.append', () => {
  it('appends into new path (creates file)', async () => {
    const s = await svc('global');
    await s.append('/a/b', 1);
    const val = await s.read('/a/b');
    expect(val).toBe(1);
  });

  it('appends into array (single and multiple)', async () => {
    const s = await svc('global');
    // seed
    await s.append('/arr', [1]); // should create [1]
    await s.append('/arr', 2); // now [1,2]
    await s.append('/arr', [3, 4]); // [1,2,3,4]
    const v = await s.read('/arr');
    expect(Array.isArray(v)).toBe(true);
    expect(v).toEqual([1, 2, 3, 4]);
  });

  it('appends into string (concat with newline)', async () => {
    const s = await svc('global');
    await s.append('/s', 'hello');
    await s.append('/s', 'world');
    const v = await s.read('/s');
    expect(v).toBe('hello\nworld');
  });

  it.skip('appends into object (shallow merge object; otherwise wrap into array)', async () => {
    const s = await svc('global');
    await s.append('/o', { a: 1 });
    await s.append('/o', { b: 2 }); // shallow merge into object
    let v = await s.read('/o');
    expect(v).toEqual({ a: 1, b: 2 });
    await s.append('/o', 3); // non-object -> wrap into array
    v = await s.read('/o');
    expect(v).toEqual([{ a: 1, b: 2 }, 3]);
  });

  it('appends into primitive -> wraps into array', async () => {
    const s = await svc('global');
    await s.append('/p', 10);
    await s.append('/p', 11);
    const v = await s.read('/p');
    expect(v).toEqual([10, 11]);
  });

  it('throws when appending to directory', async () => {
    const s = await svc('global');
    await s.ensureDir('/dir');
    const st = await s.stat('/dir');
    expect(st.kind).toBe('dir');
    await expect(s.append('/dir', 1)).rejects.toThrow();
  });

  it('perThread scoping: separate values', async () => {
    const s1 = await svc('perThread', 'T1');
    const s2 = await svc('perThread', 'T2');
    await s1.append('/k', 'v1');
    await s2.append('/k', 'v2');
    expect(await s1.read('/k')).toBe('v1');
    expect(await s2.read('/k')).toBe('v2');
  });
});
