import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Db } from 'mongodb';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SystemMessage } from '@agyn/llm';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { GraphDefinition } from '../src/graph/types';
import { LoggerService } from '../src/core/services/logger.service';
import Node from '../src/graph/nodes/base/Node';
import { GraphRepository } from '../src/graph/graph.repository';
import {
  MemoryConnectorNode,
  type MemoryConnectorStaticConfig,
} from '../src/graph/nodes/memoryConnector/memoryConnector.node';
import { MemoryService, type MemoryScope } from '../src/graph/nodes/memory.repository';
import type { TemplatePortConfig } from '../src/graph/ports.types';

// Minimal ModuleRef surface used by TemplateRegistry/LiveGraphRuntime in this test
interface MinimalModuleRef {
  create(type: new (logger: LoggerService) => Node): Promise<Node>;
}

// Test-only CallModel node wrapper that exposes a setMemoryConnector port and injects MemoryConnector message
class TestCallModelNode extends Node<Record<string, never>> {
  private conn?: MemoryConnectorNode;
  private db?: Db;
  private placement: MemoryConnectorStaticConfig['placement'] = 'after_system';
  private content: MemoryConnectorStaticConfig['content'] = 'tree';
  private maxChars = 4000;

  constructor(logger: LoggerService) {
    super(logger);
  }

  getPortConfig(): TemplatePortConfig {
    return {
      targetPorts: {
        setMemoryConnector: { kind: 'method', create: 'setMemoryConnector' },
        $self: { kind: 'instance' },
      },
      sourcePorts: { $self: { kind: 'instance' } },
    } as const;
  }

  setMemoryConnector(conn: MemoryConnectorNode): void {
    this.conn = conn;
    this.configureConnector();
  }

  // Non-DI parameters provided via explicit init from tests
  initExtras(params: {
    db: Db;
    placement?: MemoryConnectorStaticConfig['placement'];
    content?: MemoryConnectorStaticConfig['content'];
    maxChars?: number;
  }): void {
    this.db = params.db;
    if (params.placement) this.placement = params.placement;
    if (params.content) this.content = params.content;
    if (params.maxChars !== undefined) this.maxChars = params.maxChars;
    this.configureConnector();
  }

  private configureConnector(): void {
    if (!this.conn || !this.db) return;
    const conn = this.conn;
    // Configure connector static config
    void conn.setConfig({ placement: this.placement, content: this.content, maxChars: this.maxChars });
    // Provide MemoryService factory
    conn.setMemorySource((opts: { threadId?: string }) => {
      const scope: MemoryScope = opts.threadId ? 'perThread' : 'global';
      const svc = new MemoryService(this.db!);
      return svc.init({ nodeId: conn.nodeId, scope, threadId: opts.threadId });
    });
  }

  async invoke(
    input: { messages: SystemMessage[] },
    ctx: LLMContext,
  ): Promise<{ messages: SystemMessage[] }> {
    const system = SystemMessage.fromText('SYS');
    const messages: SystemMessage[] = [system, ...input.messages];
    const mem = this.conn ? await this.conn.renderMessage({ threadId: ctx.threadId }) : null;
    if (mem) {
      if (this.placement === 'after_system') messages.splice(1, 0, mem);
      else messages.push(mem);
    }
    return { messages };
  }
}

// Build a tiny runtime with two templates: callModel and memoryConnector
function makeRuntime(
  db: Db,
  _placement: 'after_system' | 'last_message',
): LiveGraphRuntime {
  const logger = new LoggerService();
  const moduleRef: MinimalModuleRef = {
    // DI create: inject logger where expected
    create: async (Cls: new (logger: LoggerService) => Node): Promise<Node> => {
      if (Cls === TestCallModelNode) return new TestCallModelNode(logger);
      if (Cls === MemoryConnectorNode) return new MemoryConnectorNode(logger);
      // Only the above classes are instantiated in this test
      throw new Error('Unexpected class requested by ModuleRef.create');
    },
  };
  const templates = new TemplateRegistry(moduleRef as import('@nestjs/core').ModuleRef);
  templates.register('callModel', { title: 'CallModel', kind: 'tool' }, TestCallModelNode);
  templates.register('memory', { title: 'Memory', kind: 'tool' }, MemoryConnectorNode);

  class StubRepo extends GraphRepository {
    async initIfNeeded(): Promise<void> {}
    async get(): Promise<null> {
      return null;
    }
    async upsert(): Promise<never> {
      throw new Error('not-implemented');
    }
    async upsertNodeState(): Promise<void> {}
  }
  // Cast moduleRef back to real ModuleRef type for LiveGraphRuntime ctor compatibility
  const runtime = new LiveGraphRuntime(logger, templates, new StubRepo(), moduleRef as import('@nestjs/core').ModuleRef);
  return runtime;
}

async function getLastMessages(runtime: LiveGraphRuntime, nodeId: string): Promise<SystemMessage[]> {
  const cm = runtime.getNodeInstance(nodeId) as TestCallModelNode;
  const out = await cm.invoke({ messages: [] }, { threadId: 'T', finishSignal: new Signal(), callerAgent: { invoke: async () => new Promise(() => {}) } } as LLMContext);
  return out.messages;
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
    try {
      await client?.close(true);
    } catch {}
    try {
      await mongod?.stop();
    } catch {}
  });

  it('injects memory after system when placement=after_system', async () => {
    const runtime = makeRuntime(db, 'after_system');
    const graph: GraphDefinition = {
      nodes: [
        { id: 'cm', data: { template: 'callModel', config: {} } },
        { id: 'mem', data: { template: 'memory', config: {} } },
      ],
      edges: [
        { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' },
      ],
    };
    await runtime.apply(graph);
    // Configure non-DI params
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ db, placement: 'after_system' });

    // Pre-populate memory under mem nodeId in global scope
    const svc = new MemoryService(db);
    svc.init({ nodeId: 'mem', scope: 'global' });
    await svc.append('/notes/today', 'hello');

    const msgs = await getLastMessages(runtime, 'cm');
    expect(msgs[0].text).toBe('SYS');
    // Memory system message is inserted at index 1
    const memText = msgs[1].text;
    expect(memText).toMatch(/Memory/);
    expect(memText).toMatch(/\[D\] notes|\[F\] notes/); // tree view shows notes dir or file
  });

  it('appends memory to last when placement=last_message', async () => {
    const runtime = makeRuntime(db, 'last_message');
    const graph: GraphDefinition = {
      nodes: [
        { id: 'cm', data: { template: 'callModel', config: {} } },
        { id: 'mem', data: { template: 'memory', config: {} } },
      ],
      edges: [
        { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' },
      ],
    };
    await runtime.apply(graph);
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ db, placement: 'last_message' });

    // Pre-populate memory
    const svc = new MemoryService(db);
    svc.init({ nodeId: 'mem', scope: 'global' });
    await svc.append('/alpha', 'a');

    const msgs = await getLastMessages(runtime, 'cm');
    const last = msgs[msgs.length - 1];
    expect(last).toBeInstanceOf(SystemMessage);
    expect(last.text).toMatch(/Memory/);
    expect(last.text).toMatch(/\[F\] alpha|\[D\] alpha/);
  });

  it('maxChars fallback: full -> tree when exceeded; per-thread empty falls back to global', async () => {
    const runtime = makeRuntime(db, 'after_system');
    const graph: GraphDefinition = {
      nodes: [
        { id: 'cm', data: { template: 'callModel', config: {} } },
        { id: 'mem', data: { template: 'memory', config: {} } },
      ],
      edges: [
        { source: 'mem', sourceHandle: '$self', target: 'cm', targetHandle: 'setMemoryConnector' },
      ],
    };
    await runtime.apply(graph);
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ db, placement: 'after_system', content: 'full', maxChars: 20 });

    // Populate global memory with a file whose full content would exceed 20 chars.
    const globalSvc = new MemoryService(db);
    globalSvc.init({ nodeId: 'mem', scope: 'global' });
    await globalSvc.append('/long/file', 'aaaaaaaaaaaaaaaaaaaa-long');

    // Expect tree fallback instead of full content
    const msgs = await getLastMessages(runtime, 'cm');
    const sys = msgs[1];
    const text = sys.text;
    expect(text).toMatch(/^Memory\n\//); // starts with Memory and a path line
    expect(text).toContain('[D] long'); // tree view, not full contents
    expect(text).not.toContain('aaaaaaaaaaaa'); // should not leak full content
  });
});
