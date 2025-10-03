import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../src/services/memory.service';

// Minimal in-memory fakes for MongoDb used by MemoryService. Deterministic and fast.
class FakeCollection<T extends MemoryDoc> {
  private store = new Map<string, any>();
  private _indexes: any[] = [];
  constructor(private name: string) {}

  private keyOf(filter: any): string {
    return JSON.stringify(filter);
  }

  async indexes() {
    return this._indexes;
  }

  async createIndex(key: any, opts: any) {
    this._indexes.push({ name: opts?.name || 'idx', key });
    return opts?.name || 'idx';
  }

  async findOne(filter: any, _options?: any) {
    const key = this.keyOf(filter);
    const doc = this.store.get(key);
    return doc ? { ...doc } : null;
  }

  async findOneAndUpdate(filter: any, update: any, options: any) {
    const key = this.keyOf(filter);
    let doc = this.store.get(key);
    if (!doc && options?.upsert) {
      // Simulate Mongo upsert that would have pre-existing doc shape when later operations rely on it
      doc = { ...filter, data: {}, dirs: {} };
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
      this.store.set(key, doc);
    }
    if (!doc) return { value: null };
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        setByPathFlat(doc, k as string, v);
      }
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) unsetByPathFlat(doc, k);
    }
    return { value: doc };
  }

  async updateOne(filter: any, update: any, options?: any) {
    const key = this.keyOf(filter);
    let doc = this.store.get(key);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
      this.store.set(key, doc);
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) setByPathFlat(doc, k as string, v);
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) unsetByPathFlat(doc, k);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class FakeDb {
  // @ts-ignore minimal implementation for tests
  collection<T>(name: string) {
    return new FakeCollection<T>(name) as any;
  }
  // @ts-ignore not used in tests
  [key: string]: any;
}

function setByPath(obj: any, path: string, value: any) {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    curr[p] = curr[p] ?? {};
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = value;
}

// Special handling: Mongo-style paths like 'data.a.b' should become doc.data['a.b'] in our flat map representation
function setByPathFlat(doc: any, path: string, value: any) {
  const [root, ...rest] = path.split('.');
  if (root === 'data' || root === 'dirs') {
    const key = rest.join('.');
    if (!doc[root]) doc[root] = {};
    doc[root][key] = value;
    return;
  }
  setByPath(doc, path, value);
}

function unsetByPath(obj: any, path: string) {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p]) return;
    curr = curr[p];
  }
  delete curr[parts[parts.length - 1]];
}

function unsetByPathFlat(doc: any, path: string) {
  const [root, ...rest] = path.split('.');
  if (root === 'data' || root === 'dirs') {
    const key = rest.join('.');
    if (doc[root]) delete doc[root][key];
    return;
  }
  unsetByPath(doc, path);
}

describe('MemoryService', () => {
  it("normalizes paths and forbids .. and $", async () => {
    const db = new FakeDb() as unknown as Db;
    const svc = new MemoryService(db, 'n1', 'global');
    expect(svc.normalizePath('a/b')).toBe('/a/b');
    expect(svc.normalizePath('/a//b/')).toBe('/a/b');
    expect(() => svc.normalizePath('../x')).toThrow();
    expect(() => svc.normalizePath('/a/$b')).toThrow();
  });

  it('append/read/update/delete with string-only semantics', async () => {
    const db = new FakeDb() as unknown as Db;
    const svc = new MemoryService(db, 'n1', 'global');
    await svc.ensureIndexes();

    await svc.append('/notes/today', 'hello');
    expect(await svc.read('/notes/today')).toBe('hello');

    await svc.append('/notes/today', 'world');
    expect(await svc.read('/notes/today')).toBe('hello\nworld');

    const count = await svc.update('/notes/today', 'world', 'there');
    expect(count).toBe(1);
    expect(await svc.read('/notes/today')).toBe('hello\nthere');

    const statFile = await svc.stat('/notes/today');
    expect(statFile.kind).toBe('file');

    const listRoot = await svc.list('/');
    expect(listRoot.find((e) => e.name === 'notes')?.kind).toBe('dir');

    const delRes = await svc.delete('/notes');
    expect(delRes.files).toBe(1);
    expect((await svc.stat('/notes')).kind).toBe('none');
  });

  it('perThread and global scoping', async () => {
    const db = new FakeDb() as unknown as Db;
    const g = new MemoryService(db, 'nodeA', 'global');
    const t1 = new MemoryService(db, 'nodeA', 'perThread', 't1');
    const t2 = new MemoryService(db, 'nodeA', 'perThread', 't2');

    await g.append('/x', 'G');
    await t1.append('/x', 'T1');
    await t2.append('/x', 'T2');

    expect(await g.read('/x')).toBe('G');
    expect(await t1.read('/x')).toBe('T1');
    expect(await t2.read('/x')).toBe('T2');
  });
});
