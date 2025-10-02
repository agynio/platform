import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Db } from 'mongodb';
import { BaseMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { GraphDefinition } from '../src/graph/types';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService, type MemoryDoc } from '../src/services/memory.service';
import { CallModelNode } from '../src/lgnodes/callModel.lgnode';
import { BaseTool } from '../src/tools/base.tool';

// Fake LLM: replace ChatOpenAI to avoid network and capture messages
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    lastMessages: BaseMessage[] = [];
    withConfig(_cfg: any) {
      return {
        invoke: async (msgs: BaseMessage[]) => {
          this.lastMessages = msgs;
          return new AIMessage('ok');
        },
      } as any;
    }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

// Minimal tool stub (unused but CallModelNode expects tools BaseTool[])
class DummyTool extends BaseTool { init(): any { return { name: 'dummy', invoke: async () => 'x' }; } }

// In-memory fake Mongo DB compatible with MemoryService operations
class FakeCollection<T extends MemoryDoc> {
  private store = new Map<string, any>();
  private _indexes: any[] = [];
  constructor(private name: string) {}
  private keyOf(filter: any): string { return JSON.stringify(filter); }
  async indexes() { return this._indexes; }
  async createIndex(key: any, opts: any) { this._indexes.push({ name: opts?.name || 'idx', key }); return opts?.name || 'idx'; }
  async findOneAndUpdate(filter: any, update: any, options: any) {
    const key = this.keyOf(filter);
    let doc = this.store.get(key);
    if (!doc && options?.upsert) {
      doc = { ...filter, data: {}, dirs: {} };
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
      this.store.set(key, doc);
    }
    if (!doc) return { value: null } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { value: doc } as any;
  }
  async updateOne(filter: any, update: any, options?: any) {
    const key = this.keyOf(filter);
    let doc = this.store.get(key);
    if (!doc && options?.upsert) { doc = { ...filter, data: {}, dirs: {} }; if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert); this.store.set(key, doc); }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 } as any;
    if (update.$set) for (const [p, v] of Object.entries(update.$set)) setByPathFlat(doc, p as string, v);
    if (update.$unset) for (const p of Object.keys(update.$unset)) unsetByPathFlat(doc, p);
    return { matchedCount: 1, modifiedCount: 1 } as any;
  }
}
class FakeDb implements Db {
  private cols = new Map<string, any>();
  // @ts-ignore minimal surface
  collection<T>(name: string) { if (!this.cols.has(name)) this.cols.set(name, new FakeCollection<T>(name)); return this.cols.get(name) as any; }
  // @ts-ignore not used
  [key: string]: any;
}
function setByPath(obj: any, path: string, value: any) { const parts = path.split('.'); let curr = obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; curr[p]=curr[p]??{}; curr=curr[p]; } curr[parts[parts.length-1]] = value; }
function setByPathFlat(doc: any, path: string, value: any) { const [root,...rest]=path.split('.'); if (root==='data'||root==='dirs'){ const key=rest.join('.'); doc[root]=doc[root]||{}; doc[root][key]=value; return; } setByPath(doc,path,value); }
function unsetByPath(obj: any, path: string) { const parts=path.split('.'); let curr=obj; for (let i=0;i<parts.length-1;i++){ const p=parts[i]; if(!curr[p]) return; curr=curr[p]; } delete curr[parts[parts.length-1]]; }
function unsetByPathFlat(doc: any, path: string) { const [root,...rest]=path.split('.'); if (root==='data'||root==='dirs'){ const key=rest.join('.'); if (doc[root]) delete doc[root][key]; return; } unsetByPath(doc,path); }

// Build a tiny runtime with two templates: callModel and memory
function makeRuntime(db: Db, placement: 'after_system'|'last_message') {
  const templates = new TemplateRegistry();
  const logger = new LoggerService();
  // Register callModel template; exposes a target port method to attach a memory connector
  templates.register(
    'callModel',
    async () => {
      const { ChatOpenAI } = await import('@langchain/openai');
      const llm = new ChatOpenAI({ model: 'x', apiKey: 'k' }) as any;
      const node = new CallModelNode([new DummyTool()] as any, llm);
      node.setSystemPrompt('SYS');
      return node as any;
    },
    {
      targetPorts: { setMemoryConnector: { kind: 'method', create: 'setMemoryConnector' }, $self: { kind: 'instance' } },
      sourcePorts: { $self: { kind: 'instance' } },
    },
    { title: 'CallModel', kind: 'tool' },
  );

  // Memory template: instance exposes createConnector() returning a connector configured with given placement
  templates.register(
    'memory',
    async (ctx) => {
      const mod = await import('../src/nodes/memory.connector.node');
      const MemoryConnectorNode = mod.MemoryConnectorNode;
      const factory = (opts: { threadId?: string }) => new MemoryService(db, ctx.nodeId, opts.threadId ? 'perThread' : 'global', opts.threadId);
      // Return the connector instance directly so it can be wired into CallModel.setMemoryConnector
      return new MemoryConnectorNode(factory, { placement, content: 'tree', maxChars: 4000 }) as any;
    },
    { sourcePorts: { $self: { kind: 'instance' } } },
    { title: 'Memory', kind: 'tool' },
  );

  const runtime = new LiveGraphRuntime(logger, templates);
  return runtime;
}

async function getLastMessages(runtime: LiveGraphRuntime, nodeId: string): Promise<BaseMessage[]> {
  const cm: any = runtime.getNodeInstance(nodeId);
  const res = await cm.action({ messages: [] as BaseMessage[] }, { configurable: { thread_id: 'T' } });
  const llm = (cm as any).llm as any;
  return (llm.lastMessages || []) as BaseMessage[];
}

describe('Runtime integration: memory injection via LiveGraphRuntime', () => {
  let db: Db;
  beforeEach(() => { db = new FakeDb() as unknown as Db; });

  it('injects memory after system when placement=after_system', async () => {
    const runtime = makeRuntime(db, 'after_system');
    const graph: GraphDefinition = {
      nodes: [ { id: 'cm', data: { template: 'callModel', config: {} } }, { id: 'mem', data: { template: 'memory', config: {} } } ],
      edges: [ { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' } ],
    };
    await runtime.apply(graph);

    // Pre-populate memory under mem nodeId in global scope
    const svc = new MemoryService(db, 'mem', 'global');
    await svc.append('/notes/today', 'hello');

    const msgs = await getLastMessages(runtime, 'cm');
    expect((msgs[0] as any).content).toBe('SYS');
    // Memory system message is inserted at index 1
    expect((msgs[1] as any).content).toMatch(/Memory/);
    expect((msgs[1] as any).content).toMatch(/\[D\] notes|\[F\] notes/); // tree view shows notes dir or file
  });

  it('appends memory to last when placement=last_message', async () => {
    const runtime = makeRuntime(db, 'last_message');
    const graph: GraphDefinition = {
      nodes: [ { id: 'cm', data: { template: 'callModel', config: {} } }, { id: 'mem', data: { template: 'memory', config: {} } } ],
      edges: [ { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' } ],
    };
    await runtime.apply(graph);

    // Pre-populate memory
    const svc = new MemoryService(db, 'mem', 'global');
    await svc.append('/alpha', 'a');

    const msgs = await getLastMessages(runtime, 'cm');
    const last = msgs[msgs.length - 1] as SystemMessage;
    expect(last).toBeInstanceOf(SystemMessage);
    expect((last as any).content).toMatch(/Memory/);
    expect((last as any).content).toMatch(/\[F\] alpha|\[D\] alpha/);
  });
});
