import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../../src/services/memory.service';
import { MemoryAppendTool } from '../../src/tools/memory/memory_append.tool';
import { MemoryReadTool } from '../../src/tools/memory/memory_read.tool';
import { LoggerService } from '../../src/services/logger.service';

// In-memory fake Db compatible with MemoryService for deterministic tests
class FakeCollection<T extends MemoryDoc> {
  private store = new Map<string, any>();
  async indexes() { return []; }
  async createIndex() { return 'idx'; }
  private keyOf(filter: any) { return JSON.stringify(filter); }
  async findOne(filter: any, _options?: any) {
    const k = this.keyOf(filter);
    const doc = this.store.get(k);
    return doc ? { ...doc } : null;
  }
  async findOneAndUpdate(filter: any, update: any, options: any) {
    const k = this.keyOf(filter);
    let doc = this.store.get(k);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
      this.store.set(k, doc);
    }
    if (!doc) return { value: null } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { value: doc } as any;
  }
  async updateOne(filter: any, update: any, options?: any) {
    const k = this.keyOf(filter);
    let doc = this.store.get(k);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      this.store.set(k, doc);
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { matchedCount: 1, modifiedCount: 1 } as any;
  }
}
class FakeDb {
  private cols = new Map<string, any>();
  collection<T>(name: string) {
    if (!this.cols.has(name)) this.cols.set(name, new FakeCollection<T>());
    return this.cols.get(name) as any;
  }
  [k: string]: any
}
function setByPath(obj: any, path: string, value: any) { const parts = path.split('.'); let curr = obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; curr[p]=curr[p]??{}; curr=curr[p]; } curr[parts[parts.length-1]] = value; }
function setByPathFlat(doc: any, path: string, value: any) {
  const [root, ...rest] = path.split('.');
  if (root === 'data' || root === 'dirs') { const key = rest.join('.'); doc[root] = doc[root] || {}; doc[root][key] = value; return; }
  setByPath(doc, path, value);
}
function unsetByPath(obj: any, path: string) { const parts = path.split('.'); let curr = obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; if(!curr[p]) return; curr=curr[p]; } delete curr[parts[parts.length-1]]; }
function unsetByPathFlat(doc: any, path: string) { const [root, ...rest] = path.split('.'); if (root === 'data' || root === 'dirs') { const key = rest.join('.'); if (doc[root]) delete doc[root][key]; return; } unsetByPath(doc, path); }


describe('memory_append tool: path normalization and validation', () => {
  const mkTools = () => {
    const db = new FakeDb() as unknown as Db;
    const factory = (opts: { threadId?: string }) => new MemoryService(db, 'nodeT', opts.threadId ? 'perThread' : 'global', opts.threadId);
    const logger = new LoggerService();
    const append = new MemoryAppendTool(logger);
    append.setMemorySource(factory);
    const read = new MemoryReadTool(logger);
    read.setMemorySource(factory);
    const cfg = { configurable: { thread_id: 'T1' } } as any;
    return { append: append.init(), read: read.init(), cfg };
  };

  it('Case A: path without leading slash is normalized and succeeds', async () => {
    const { append, read, cfg } = mkTools();
    await append.invoke({ path: 'U08ES6U5SSF', data: '{"user":"v"}' }, cfg);
    const content = await read.invoke({ path: '/U08ES6U5SSF' }, cfg);
    expect(typeof content).toBe('string');
    expect(String(content)).toContain('user');
  });

  it('Case B: path with leading slash works as control', async () => {
    const { append, read, cfg } = mkTools();
    await append.invoke({ path: '/U08ES6U5SSF', data: 'hello' }, cfg);
    const content = await read.invoke({ path: '/U08ES6U5SSF' }, cfg);
    expect(content).toBe('hello');
  });

  it('Case C: invalid characters in path trigger validation error', async () => {
    const { append, cfg } = mkTools();
    await expect(append.invoke({ path: '../hack', data: 'x' }, cfg)).rejects.toThrow();
    await expect(append.invoke({ path: '/bad$eg', data: 'x' }, cfg)).rejects.toThrow();
  });

  it('Case D: append to new then existing file succeeds', async () => {
    const { append, read, cfg } = mkTools();
    await append.invoke({ path: '/file', data: 'one' }, cfg);
    await append.invoke({ path: '/file', data: 'two' }, cfg);
    const content = await read.invoke({ path: '/file' }, cfg);
    expect(content).toBe('one\ntwo');
  });

  it('Case E: nested path without leading slash is normalized and parent dirs ensured', async () => {
    const { append, read, cfg } = mkTools();
    await append.invoke({ path: 'users/U08ES6U5SSF', data: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' }, cfg);
    const content = await read.invoke({ path: '/users/U08ES6U5SSF' }, cfg);
    expect(String(content)).toContain('Vitalii');
  });

  it('Case F: nested path with leading slash works identically', async () => {
    const { append, read, cfg } = mkTools();
    await append.invoke({ path: '/users/U08ES6U5SSF', data: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' }, cfg);
    const content = await read.invoke({ path: '/users/U08ES6U5SSF' }, cfg);
    expect(String(content)).toContain('U08ES6U5SSF');
  });
});
