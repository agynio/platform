import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../src/services/memory.service';
import { MemoryReadTool } from '../src/tools/memory/memory_read.tool';
import { MemoryListTool } from '../src/tools/memory/memory_list.tool';
import { MemoryAppendTool } from '../src/tools/memory/memory_append.tool';
import { MemoryUpdateTool } from '../src/tools/memory/memory_update.tool';
import { MemoryDeleteTool } from '../src/tools/memory/memory_delete.tool';
import { LoggerService } from '../src/services/logger.service';

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

describe('Memory tool adapters', () => {
  it('wrap LangChain tools and operate on MemoryService via config.thread_id', async () => {
    const db = new FakeDb() as unknown as Db;
    const serviceFactory = (opts: { threadId?: string }) => new MemoryService(db, 'nodeX', opts.threadId ? 'perThread' : 'global', opts.threadId);
    const logger = new LoggerService();
    const mk = (t: any) => { t.setMemorySource(serviceFactory); return t; };
    const adapters = [
      mk(new MemoryAppendTool(logger)),
      mk(new MemoryDeleteTool(logger)),
      mk(new MemoryListTool(logger)),
      mk(new MemoryReadTool(logger)),
      mk(new MemoryUpdateTool(logger)),
    ];
    const names = adapters.map((a) => a.init().name).sort();
    expect(names).toEqual(['memory_append','memory_delete','memory_list','memory_read','memory_update']);

    const config = { configurable: { thread_id: 'T1' } } as any;
    const append = adapters.find((a) => a.init().name === 'memory_append')!.init();
    await append.invoke({ path: '/a/x', data: 'one' }, config);

    const read = adapters.find((a) => a.init().name === 'memory_read')!.init();
    expect(await read.invoke({ path: '/a/x' }, config)).toBe('one');

    const update = adapters.find((a) => a.init().name === 'memory_update')!.init();
    const count = await update.invoke({ path: '/a/x', old_data: 'one', new_data: 'two' }, config);
    expect(count).toBe(1);

    const list = adapters.find((a) => a.init().name === 'memory_list')!.init();
    const listing = JSON.parse(await list.invoke({ path: '/' }, config));
    expect(Array.isArray(listing)).toBe(true);

    const del = adapters.find((a) => a.init().name === 'memory_delete')!.init();
    const delRes = JSON.parse(await del.invoke({ path: '/a' }, config));
    expect(delRes.files).toBe(1);
  });
});
