import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { SystemMessage } from '@agyn/llm';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { GraphDefinition } from '../src/shared/types/graph.types';
import { LoggerService } from '../src/core/services/logger.service';
import Node from '../src/nodes/base/Node';
import { GraphRepository } from '../src/graph/graph.repository';
import {
  MemoryConnectorNode,
  type MemoryConnectorStaticConfig,
} from '../src/nodes/memoryConnector/memoryConnector.node';
import { PostgresMemoryEntitiesRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';
import type { MemoryScope } from '../src/nodes/memory/memory.types';
import type { TemplatePortConfig } from '../src/graph/ports.types';

const createMemoryService = (prisma: PrismaClient) =>
  new MemoryService(new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any), { get: async () => null } as any);

// Minimal ModuleRef surface used by TemplateRegistry/LiveGraphRuntime in this test
interface MinimalModuleRef {
  create(type: new (logger: LoggerService) => Node): Promise<Node>;
}

// Test-only CallModel node wrapper that exposes a setMemoryConnector port and injects MemoryConnector message
class TestCallModelNode extends Node<Record<string, never>> {
  private conn?: MemoryConnectorNode;
  private prisma?: PrismaClient;
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
    prisma: PrismaClient;
    placement?: MemoryConnectorStaticConfig['placement'];
    content?: MemoryConnectorStaticConfig['content'];
    maxChars?: number;
  }): void {
    this.prisma = params.prisma;
    if (params.placement) this.placement = params.placement;
    if (params.content) this.content = params.content;
    if (params.maxChars !== undefined) this.maxChars = params.maxChars;
    this.configureConnector();
  }

  private configureConnector(): void {
    if (!this.conn || !this.prisma) return;
    const conn = this.conn;
    // Configure connector static config
    void conn.setConfig({ placement: this.placement, content: this.content, maxChars: this.maxChars });
    // Provide MemoryService factory
    conn.setMemorySource((opts: { threadId?: string }) => {
      const scope: MemoryScope = opts.threadId ? 'perThread' : 'global';
      const svc = createMemoryService(this.prisma!);
      return svc.forMemory(conn.nodeId, scope, opts.threadId);
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
  _prisma: PrismaClient,
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
  const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
  const runtime = new LiveGraphRuntime(logger, templates, new StubRepo(), moduleRef as import('@nestjs/core').ModuleRef, resolver as any);
  return runtime;
}

async function getLastMessages(runtime: LiveGraphRuntime, nodeId: string): Promise<SystemMessage[]> {
  const cm = runtime.getNodeInstance(nodeId) as TestCallModelNode;
  const out = await cm.invoke(
    { messages: [], context: { messageIds: [], memory: [] } },
    {
      threadId: 'T',
      runId: 'R',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { invoke: async () => new Promise(() => {}) },
    } as LLMContext,
  );
  return out.messages;
}

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

maybeDescribe('Runtime integration: memory injection via LiveGraphRuntime', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });

  beforeAll(async () => {
    const svc = createMemoryService(prisma);
    svc.forMemory('bootstrap', 'global');
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(['bootstrap', 'mem'])})`;
  });

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(['mem'])})`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('injects memory after system when placement=after_system', async () => {
    const runtime = makeRuntime(prisma, 'after_system');
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
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ prisma, placement: 'after_system' });

    // Pre-populate memory under mem nodeId in global scope
    const svc = createMemoryService(prisma);
    const bound = svc.forMemory('mem', 'global');
    await bound.append('/notes/today', 'hello');

    const msgs = await getLastMessages(runtime, 'cm');
    expect(msgs[0].text).toBe('SYS');
    // Memory system message is inserted at index 1
    const memText = msgs[1].text;
    expect(memText).toMatch(/Memory/);
    expect(memText).toMatch(/\[\+\] notes|\[ \] notes/); // tree view shows notes entry
  });

  it('appends memory to last when placement=last_message', async () => {
    const runtime = makeRuntime(prisma, 'last_message');
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
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ prisma, placement: 'last_message' });

    // Pre-populate memory
    const svc = createMemoryService(prisma);
    const bound = svc.forMemory('mem', 'global');
    await bound.append('/alpha', 'a');

    const msgs = await getLastMessages(runtime, 'cm');
    const last = msgs[msgs.length - 1];
    expect(last).toBeInstanceOf(SystemMessage);
    expect(last.text).toMatch(/Memory/);
    expect(last.text).toMatch(/\[\+\] alpha|\[ \] alpha/);
  });

  it('maxChars fallback: full -> tree when exceeded; per-thread empty falls back to global', async () => {
    const runtime = makeRuntime(prisma, 'after_system');
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
    (runtime.getNodeInstance('cm') as TestCallModelNode).initExtras({ prisma, placement: 'after_system', content: 'full', maxChars: 20 });

    // Populate global memory with a file whose full content would exceed 20 chars.
    const globalSvc = createMemoryService(prisma);
    const boundGlobal = globalSvc.forMemory('mem', 'global');
    await boundGlobal.append('/long/file', 'aaaaaaaaaaaaaaaaaaaa-long');

    // Expect tree fallback instead of full content
    const msgs = await getLastMessages(runtime, 'cm');
    const sys = msgs[1];
    const text = sys.text;
    expect(text).toMatch(/^Memory\n\//); // starts with Memory and a path line
    expect(text).toContain('[+] long'); // tree view, not full contents
    expect(text).not.toContain('aaaaaaaaaaaa'); // should not leak full content
  });
});
