import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Db } from 'mongodb';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { LoggerService } from '../../src/services/logger.service';
import { MemoryNode } from '../../src/nodes/memory.node';
import { MemoryAppendTool } from '../../src/tools/memory/memory_append.tool';
import { MemoryReadTool } from '../../src/tools/memory/memory_read.tool';

// Minimal HTTP client using global fetch (Node >=18)
async function postJSON(url: string, body: any) {
  const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: resp.status, json, text };
}

// In-memory fake Db compatible with MemoryService
class FakeCollection<T = any> {
  private store = new Map<string, any>();
  async indexes() { return []; }
  async createIndex() { return 'idx'; }
  private keyOf(filter: any) { return JSON.stringify(filter); }
  async findOne(filter: any) { return this.store.get(this.keyOf(filter)) ?? null; }
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
class FakeDb implements Db {
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


describe.skip('DebugTool HTTP trigger e2e with Memory', () => {
  const logger = new LoggerService();

  // We'll compose a small fastify here to expose two routes wired to tools
  let fastify: any;
  let baseURL = '';

  beforeAll(async () => {
    const db = new FakeDb() as unknown as Db;

    // Memory node factory
    const memNode = new MemoryNode(db as any, 'mem1', { scope: 'global' });

    // Tools (wire memory on instances before init)
    const appendInst = new MemoryAppendTool(logger);
    appendInst.setMemorySource(memNode);
    const appendTool = appendInst.init();
    const readInst = new MemoryReadTool(logger);
    readInst.setMemorySource(memNode);
    const readTool = readInst.init();

    // Simple HTTP server
    fastify = Fastify({ logger: false });
    await fastify.register(cors, { origin: true });

    // Routes
    fastify.post('/debug/append', async (request, reply) => {
      const body = request.body as any;
      if (!appendTool) { reply.code(400); return { error: 'tool_not_connected' }; }
      const result = await (appendTool as any).invoke(body?.input, { configurable: { thread_id: 'debug' } });
      return { ok: true, result };
    });
    fastify.post('/debug/read', async (request, reply) => {
      const body = request.body as any;
      if (!readTool) { reply.code(400); return { error: 'tool_not_connected' }; }
      const result = await (readTool as any).invoke(body?.input, { configurable: { thread_id: 'debug' } });
      return { ok: true, result };
    });

    await fastify.listen({ port: 0, host: '127.0.0.1' });
    const addr = fastify.server.address();
    const port = typeof addr === 'object' && addr ? (addr as any).port : 0;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => { try { await fastify?.close(); } catch {} });

  it('append then read via HTTP', async () => {
    const appendRes = await postJSON(`${baseURL}/debug/append`, { input: { path: 'user/111', data: '{"username":"Test"}' } });
    expect(appendRes.status).toBe(200);
    const readRes = await postJSON(`${baseURL}/debug/read`, { input: { path: 'user/111' } });
    expect(readRes.status).toBe(200);
    expect(readRes.json?.result).toContain('Test');
  });
});
