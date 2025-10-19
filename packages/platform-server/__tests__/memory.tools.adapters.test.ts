import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../src/services/memory.service';
import { UnifiedMemoryTool } from '../src/tools/memory/memory.tool';
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
    const adapter = mk(new UnifiedMemoryTool(logger));
    const name = adapter.init().name;
    expect(name).toBe('memory');

    const config = { configurable: { thread_id: 'T1' } } as any;
    const unified = adapter.init();
    await unified.invoke({ path: '/a/x', command: 'append', content: 'one' }, config);

    const readRes = JSON.parse(await unified.invoke({ path: '/a/x', command: 'read' }, config) as any);
    expect(readRes.ok).toBe(true);
    expect(readRes.result.content).toBe('one');

    const upd = JSON.parse(await unified.invoke({ path: '/a/x', command: 'update', oldContent: 'one', content: 'two' }, config) as any);
    expect(upd.result.replaced).toBe(1);

    const listRes = JSON.parse(await unified.invoke({ path: '/', command: 'list' }, config) as any);
    expect(Array.isArray(listRes.result.entries)).toBe(true);

    const delRes = JSON.parse(await unified.invoke({ path: '/a', command: 'delete' }, config) as any);
    expect(delRes.result.files).toBe(1);
  });

  it('negative cases: ENOENT, EISDIR, EINVAL, ENOTMEM, list empty path', async () => {
    const db = new FakeDb() as unknown as Db;
    const serviceFactory = (opts: { threadId?: string }) => new MemoryService(db, 'nodeX', opts.threadId ? 'perThread' : 'global', opts.threadId);
    const logger = new LoggerService();

    // ENOTMEM: do not wire memory
    const unconnected = new UnifiedMemoryTool(logger).init();
    const enotmem = JSON.parse((await unconnected.invoke({ path: '/x', command: 'read' }, { configurable: { thread_id: 'T1' } } as any)) as any);
    expect(enotmem.ok).toBe(false);
    expect(enotmem.error.code).toBe('ENOTMEM');

    // Properly wired instance
    const wired = new UnifiedMemoryTool(logger); wired.setMemorySource(serviceFactory); const tool = wired.init();
    const cfg = { configurable: { thread_id: 'T1' } } as any;

    // ENOENT on read
    const enoentRead = JSON.parse((await tool.invoke({ path: '/missing', command: 'read' }, cfg)) as any);
    expect(enoentRead.ok).toBe(false);
    expect(enoentRead.error.code).toBe('ENOENT');

    // ENOENT on update when file does not exist
    const enoentUpdate = JSON.parse((await tool.invoke({ path: '/missing', command: 'update', oldContent: 'x', content: 'y' }, cfg)) as any);
    expect(enoentUpdate.ok).toBe(false);
    expect(enoentUpdate.error.code).toBe('ENOENT');

    // Prepare a dir and file
    await tool.invoke({ path: 'dir/file', command: 'append', content: 'v' }, cfg);

    // EISDIR on append/update at dir
    const eisdirAppend = JSON.parse((await tool.invoke({ path: '/dir', command: 'append', content: 'x' }, cfg)) as any);
    expect(eisdirAppend.ok).toBe(false);
    expect(eisdirAppend.error.code).toBe('EISDIR');

    const eisdirUpdate = JSON.parse((await tool.invoke({ path: '/dir', command: 'update', oldContent: 'a', content: 'b' }, cfg)) as any);
    expect(eisdirUpdate.ok).toBe(false);
    expect(eisdirUpdate.error.code).toBe('EISDIR');

    // EINVAL: missing content/oldContent and unknown command
    const einvalAppend = JSON.parse((await tool.invoke({ path: '/dir/file', command: 'append' } as any, cfg)) as any);
    expect(einvalAppend.ok).toBe(false);
    expect(einvalAppend.error.code).toBe('EINVAL');
    const einvalUpdate = JSON.parse((await tool.invoke({ path: '/dir/file', command: 'update', oldContent: 'x' } as any, cfg)) as any);
    expect(einvalUpdate.ok).toBe(false);
    expect(einvalUpdate.error.code).toBe('EINVAL');
    const unknownCmd = JSON.parse((await tool.invoke({ path: '/dir/file', command: 'unknown' } as any, cfg)) as any);
    expect(unknownCmd.ok).toBe(false);
    expect(unknownCmd.error.code).toBe('EINVAL');

    // list with empty path
    const listRoot = JSON.parse((await tool.invoke({ path: '', command: 'list' } as any, cfg)) as any);
    expect(listRoot.ok).toBe(true);
    expect(Array.isArray(listRoot.result.entries)).toBe(true);
  });
});
