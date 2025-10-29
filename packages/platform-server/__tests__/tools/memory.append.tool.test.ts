import { describe, it, expect } from 'vitest';
import type { Db } from 'mongodb';
import { MemoryService, type MemoryDoc } from '../../src/graph/nodes/memory.repository';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../../src/graph/nodes/tools/memory/memory.tool';
import { LoggerService } from '../../src/core/services/logger.service';
import { MemoryToolNode } from '../../src/graph/nodes/tools/memory/memory.node';

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
    const factory = (opts: { threadId?: string }) => { const svc = new MemoryService(db); svc.init({ nodeId: 'nodeT', scope: opts.threadId ? 'perThread' : 'global', threadId: opts.threadId }); return svc; };
    const logger = new LoggerService();
    const node = new MemoryToolNode(logger);
    node.setMemorySource(factory);
    const tool = node.getTool();
    const cfg = { threadId: 'T1' } as any;
    return { unified: tool, cfg };
  };

  it('Case A: path without leading slash is normalized and succeeds', async () => {
    const { unified, cfg } = mkTools();
    await unified.execute({ path: 'U08ES6U5SSF', command: 'append', content: '{"user":"v"}' } as any);
    const content = JSON.parse(await unified.execute({ path: '/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(typeof content.result.content).toBe('string');
    expect(String(content.result.content)).toContain('user');
  });

  it('Case B: path with leading slash works as control', async () => {
    const { unified, cfg } = mkTools();
    await unified.execute({ path: '/U08ES6U5SSF', command: 'append', content: 'hello' } as any);
    const content = JSON.parse(await unified.execute({ path: '/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(content.result.content).toBe('hello');
  });

  it('Case C: invalid characters in path trigger validation error', async () => {
    const { unified, cfg } = mkTools();
    const res1 = JSON.parse((await unified.execute({ path: '../hack', command: 'append', content: 'x' } as any)) as any);
    expect(res1.ok).toBe(false);
    expect(res1.error.code).toBe('EINVAL');
    const res2 = JSON.parse((await unified.execute({ path: '/bad$eg', command: 'append', content: 'x' } as any)) as any);
    expect(res2.ok).toBe(false);
    expect(res2.error.code).toBe('EINVAL');
  });

  it('Case D: append to new then existing file succeeds', async () => {
    const { unified, cfg } = mkTools();
    await unified.execute({ path: '/file', command: 'append', content: 'one' } as any);
    await unified.execute({ path: '/file', command: 'append', content: 'two' } as any);
    const content = JSON.parse(await unified.execute({ path: '/file', command: 'read' } as any) as any);
    expect(content.result.content).toBe('one\ntwo');
  });

  it('Case E: nested path without leading slash is normalized and parent dirs ensured', async () => {
    const { unified, cfg } = mkTools();
    await unified.execute({ path: 'users/U08ES6U5SSF', command: 'append', content: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' } as any);
    const content = JSON.parse(await unified.execute({ path: '/users/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(String(content.result.content)).toContain('Vitalii');
  });

  it('Case F: nested path with leading slash works identically', async () => {
    const { unified, cfg } = mkTools();
    await unified.execute({ path: '/users/U08ES6U5SSF', command: 'append', content: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' } as any);
    const content = JSON.parse(await unified.execute({ path: '/users/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(String(content.result.content)).toContain('U08ES6U5SSF');
  });
});
