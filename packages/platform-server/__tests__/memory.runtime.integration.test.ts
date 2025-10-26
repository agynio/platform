import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Db } from 'mongodb';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BaseMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { ModuleRef } from '@nestjs/core';
import type { GraphDefinition } from '../src/graph/types';
import { LoggerService } from '../src/core/services/logger.service.js';
import { MemoryService } from '../src/nodes/memory.repository';
// Updated tests should not use legacy lgnodes; adjust to reducers/AgentNode patterns if needed.
import { BaseTool } from '../src/tools/base.tool';

// Fake LLM: replace ChatOpenAI to avoid network and capture messages
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod: any = await importOriginal();
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
  return { ...(mod as any), ChatOpenAI: MockChatOpenAI } as any;
});

// Minimal tool stub (unused but CallModelNode expects tools BaseTool[])
class DummyTool extends BaseTool { init(): any { return { name: 'dummy', invoke: async () => 'x' }; } }

// Build a tiny runtime with two templates: callModel and memory
function makeRuntime(db: Db, placement: 'after_system'|'last_message') {
  const moduleRef = { create: (Cls: any) => new Cls() } as ModuleRef;
  const templates = new TemplateRegistry(moduleRef as unknown as any);
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
      const mod = await import('../src/nodes/memoryConnector/memoryConnector.node');
      const MemoryConnectorNode = mod.MemoryConnectorNode;
      const factory = (opts: { threadId?: string }) => { const s = new MemoryService(db); s.init({ nodeId: ctx.nodeId, scope: opts.threadId ? 'perThread' : 'global', threadId: opts.threadId }); return s; };
      const n = new MemoryConnectorNode();
      n.init({ getMemoryService: factory });
      n.setConfig({ placement, content: 'tree', maxChars: 4000 });
      return n as any;
    },
    { sourcePorts: { $self: { kind: 'instance' } } },
    { title: 'Memory', kind: 'tool' },
  );

  class StubRepo extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
  const runtime = new LiveGraphRuntime(logger, templates as any, new StubRepo(), { create: (Cls: any) => new Cls() } as any);
  return runtime;
}

async function getLastMessages(runtime: LiveGraphRuntime, nodeId: string): Promise<BaseMessage[]> {
  const cm: any = runtime.getNodeInstance(nodeId);
  const res = await cm.action({ messages: [] as BaseMessage[] }, { configurable: { thread_id: 'T' } });
  const llm = (cm as any).llm as any;
  return (llm.lastMessages || []) as BaseMessage[];
}

const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';

describe.skipIf(!RUN_MONGOMS)('Runtime integration: memory injection via LiveGraphRuntime', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    // Pin explicit MongoDB binary to ensure consistency across CI/local (mirrors MONGOMS_VERSION)
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test');
  });

  afterAll(async () => {
    try { await client?.close(true); } catch {}
    try { await mongod?.stop(); } catch {}
  });

  it('injects memory after system when placement=after_system', async () => {
    const runtime = makeRuntime(db, 'after_system');
    const graph: GraphDefinition = {
      nodes: [ { id: 'cm', data: { template: 'callModel', config: {} } }, { id: 'mem', data: { template: 'memory', config: {} } } ],
      edges: [ { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' } ],
    };
    await runtime.apply(graph);

    // Pre-populate memory under mem nodeId in global scope
    const svc = new MemoryService(db); svc.init({ nodeId: 'mem', scope: 'global' });
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
    const svc = new MemoryService(db); svc.init({ nodeId: 'mem', scope: 'global' });
    await svc.append('/alpha', 'a');

    const msgs = await getLastMessages(runtime, 'cm');
    const last = msgs[msgs.length - 1] as SystemMessage;
    expect(last).toBeInstanceOf(SystemMessage);
    expect((last as any).content).toMatch(/Memory/);
    expect((last as any).content).toMatch(/\[F\] alpha|\[D\] alpha/);
  });

  it('maxChars fallback: full -> tree when exceeded; per-thread empty falls back to global', async () => {
    // Configure memory connector with content=full and small maxChars so it triggers tree fallback
    const moduleRef = { create: (Cls: any) => new Cls() } as any;
    const templates = new TemplateRegistry(moduleRef);
    const logger = new LoggerService();

    templates.register(
      'callModel',
      async () => {
        const { ChatOpenAI } = await import('@langchain/openai');
        const llm = new ChatOpenAI({ model: 'x', apiKey: 'k' }) as any;
        const node = new CallModelNode([new DummyTool()] as any, llm);
        node.setSystemPrompt('SYS');
        return node as any;
      },
      { targetPorts: { setMemoryConnector: { kind: 'method', create: 'setMemoryConnector' }, $self: { kind: 'instance' } }, sourcePorts: { $self: { kind: 'instance' } } },
      { title: 'CallModel', kind: 'tool' },
    );

    templates.register(
      'memory',
      async (ctx) => {
      const mod = await import('../src/nodes/memoryConnector/memoryConnector.node');
      const MemoryConnectorNode = mod.MemoryConnectorNode;
      const factory = (opts: { threadId?: string }) => { const s = new MemoryService(db); s.init({ nodeId: ctx.nodeId, scope: opts.threadId ? 'perThread' : 'global', threadId: opts.threadId }); return s; };
      const n = new MemoryConnectorNode();
      n.init({ getMemoryService: factory });
        n.setConfig({ placement: 'after_system', content: 'full', maxChars: 20 });
        return n as any;
      },
      { sourcePorts: { $self: { kind: 'instance' } } },
      { title: 'Memory', kind: 'tool' },
    );

    class StubRepo2 extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
    const runtime = new LiveGraphRuntime(logger, templates as any, new StubRepo2(), { create: (Cls: any) => new Cls() } as any);
    const graph: GraphDefinition = {
      nodes: [ { id: 'cm', data: { template: 'callModel', config: {} } }, { id: 'mem', data: { template: 'memory', config: {} } } ],
      edges: [ { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' } ],
    };
    await runtime.apply(graph);

    // Populate global memory with a file whose full content would exceed 20 chars.
    const globalSvc = new MemoryService(db); globalSvc.init({ nodeId: 'mem', scope: 'global' });
    await globalSvc.append('/long/file', 'aaaaaaaaaaaaaaaaaaaa-long');

    // Per-thread scope is empty; connector should fallback to global and render a tree instead of full content
    const cm: any = runtime.getNodeInstance('cm');
    const res = await cm.action({ messages: [] as BaseMessage[] }, { configurable: { thread_id: 'T' } });
    const llm = (cm as any).llm as any;
    const msgs = (llm.lastMessages || []) as BaseMessage[];
    const sys = msgs[1] as SystemMessage;
    const text = (sys as any).content as string;
    expect(text).toMatch(/^Memory\n\//); // starts with Memory and a path line
    expect(text).toContain('[D] long'); // tree view, not full contents
    expect(text).not.toContain('aaaaaaaaaaaa'); // should not leak full content
  });
});
