import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';

import { ResponseMessage, AIMessage } from '@agyn/llm';

import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LoggerService } from '../src/core/services/logger.service.js';
import { Signal } from '../src/signal';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { LLMContext } from '../src/llm/types';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';

class StubLLMProvisioner extends LLMProvisioner {
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
}

class FakeAgent extends AgentNode {
  override getPortConfig() {
    return { sourcePorts: {}, targetPorts: { $self: { kind: 'instance' } } } as const;
  }
  override getAgentNodeId(): string | undefined {
    return 'agent-' + Math.random().toString(36).slice(2, 6);
  }
  override async invoke(thread: string): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText(`ok-${thread}`).toPlain()] });
  }
}

function buildCtx(overrides: Partial<LLMContext> = {}): LLMContext {
  return {
    threadId: 'parent',
    runId: 'run',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) },
    ...overrides,
  } as LLMContext;
}

async function createHarness(options: { persistence?: AgentsPersistenceService } = {}) {
  const defaultSpy = vi.fn().mockResolvedValue('child-default');
  const hasCustomPersistence = Object.prototype.hasOwnProperty.call(options, 'persistence');
  const persistence = hasCustomPersistence
    ? (options.persistence as AgentsPersistenceService)
    : ({ getOrCreateSubthreadByAlias: defaultSpy } as unknown as AgentsPersistenceService);

  const module = await Test.createTestingModule({
    providers: [
      LoggerService,
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' }),
        ),
      },
      { provide: LLMProvisioner, useClass: StubLLMProvisioner },
      ManageFunctionTool,
      ManageToolNode,
      FakeAgent,
      { provide: AgentsPersistenceService, useValue: persistence },
      RunSignalsRegistry,
    ],
  }).compile();

  const node = await module.resolve(ManageToolNode);
  await node.setConfig({ description: 'desc' });
  const tool = node.getTool();

  return { module, node, tool, spy: hasCustomPersistence ? null : defaultSpy };
}

async function addWorker(module: Awaited<ReturnType<typeof createHarness>>['module'], node: ManageToolNode, title: string) {
  const worker = await module.resolve(FakeAgent);
  await worker.setConfig({ title });
  node.addWorker(worker);
  return worker;
}

describe('ManageTool unit', () => {
  it('send_message: uses explicit threadAlias verbatim after trim', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-explicit');
    const persistence = { getOrCreateSubthreadByAlias } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence });
    await addWorker(harness.module, harness.node, '  child-1  ');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      {
        command: 'send_message',
        worker: ' child-1 ',
        message: 'hello',
        threadAlias: '  Mixed.Alias-Case_123  ',
      },
      ctx,
    );

    expect(res?.startsWith('ok-')).toBe(true);
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'Mixed.Alias-Case_123', 'parent', '');
  });

  it('send_message: derives sanitized alias when omitted', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-derived');
    const persistence = { getOrCreateSubthreadByAlias } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence });
    await addWorker(harness.module, harness.node, 'Alpha Worker');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      { command: 'send_message', worker: 'Alpha Worker', message: 'ping' },
      ctx,
    );

    expect(res?.startsWith('ok-')).toBe(true);
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'alpha-worker', 'parent', '');
  });

  it('send_message: rejects empty alias after trim', async () => {
    const harness = await createHarness();
    await addWorker(harness.module, harness.node, 'Worker X');
    const ctx = buildCtx();

    await expect(
      harness.tool.execute(
        { command: 'send_message', worker: 'Worker X', message: 'hi', threadAlias: '   ' },
        ctx,
      ),
    ).rejects.toThrow('Manage: invalid or empty threadAlias');
    expect(harness.spy).not.toHaveBeenCalled();
  });

  it('send_message: validates worker/message parameters and unknown worker', async () => {
    const harness = await createHarness();
    const ctx = buildCtx();

    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'x', message: 'hi' }, ctx),
    ).rejects.toThrow('No agents connected');

    await addWorker(harness.module, harness.node, 'w1');

    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'w1' }, ctx),
    ).rejects.toThrow('message is required for send_message');
    await expect(
      harness.tool.execute({ command: 'send_message', worker: '   ', message: 'hi' }, ctx),
    ).rejects.toThrow('worker is required for send_message');
    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'w1', message: '   ' }, ctx),
    ).rejects.toThrow('message is required for send_message');
    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'unknown', message: 'm' }, ctx),
    ).rejects.toThrow('Unknown worker: unknown');
  });

  it('send_message: persistence unavailable guard', async () => {
    const harness = await createHarness({ persistence: undefined as unknown as AgentsPersistenceService });
    await addWorker(harness.module, harness.node, 'Worker Y');
    const ctx = buildCtx();

    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'Worker Y', message: 'msg' }, ctx),
    ).rejects.toThrow('Manage: persistence unavailable');
  });

  it('execute: missing threadId guard', async () => {
    const harness = await createHarness();
    await addWorker(harness.module, harness.node, 'Worker Z');
    const ctx = buildCtx({ threadId: undefined as unknown as string });

    await expect(
      harness.tool.execute({ command: 'send_message', worker: 'Worker Z', message: 'msg' }, ctx),
    ).rejects.toThrow('Manage: missing threadId in LLM context');
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const harness = await createHarness();
    await addWorker(harness.module, harness.node, 'A');
    await addWorker(harness.module, harness.node, 'B');

    const ctx = buildCtx();
    const statusStr = await harness.tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const status = JSON.parse(statusStr) as { activeTasks: number; childThreadIds: string[] };
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('ManageToolNode enforces titled workers and handles retitle/removal', async () => {
    const harness = await createHarness();

    const first = await addWorker(harness.module, harness.node, 'Alpha');
    expect(harness.node.listWorkers()).toEqual(['Alpha']);
    expect(() => harness.node.addWorker(first)).not.toThrow();

    const noTitle = await harness.module.resolve(FakeAgent);
    await noTitle.setConfig({});
    expect(() => harness.node.addWorker(noTitle)).toThrow('ManageToolNode: worker agent requires non-empty title');

    const dup = await harness.module.resolve(FakeAgent);
    await dup.setConfig({ title: '  Alpha  ' });
    expect(() => harness.node.addWorker(dup)).toThrow('ManageToolNode: worker with title "Alpha" already exists');

    await first.setConfig({ title: ' Beta ' });
    expect(harness.node.listWorkers()).toEqual(['Beta']);
    expect(harness.node.getWorkerByTitle('Beta')).toBe(first);

    harness.node.removeWorker(first);
    expect(harness.node.listWorkers()).toEqual([]);
  });

  it('send_message: surfaces child agent failure', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' }),
          ),
        },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: { getOrCreateSubthreadByAlias: async () => 'child-t' } as unknown as AgentsPersistenceService,
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });

    class ThrowingAgent extends FakeAgent {
      override async invoke(): Promise<ResponseMessage> {
        throw new Error('child failure');
      }
    }

    const failingAgent = new ThrowingAgent(
      module.get(ConfigService),
      module.get(LoggerService),
      module.get(LLMProvisioner),
      module.get(ModuleRef),
    );
    await failingAgent.setConfig({ title: 'W' });
    node.addWorker(failingAgent);

    const tool = node.getTool();
    const ctx = buildCtx({ threadId: 'p' });
    await expect(
      tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx),
    ).rejects.toThrow('child failure');
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to agents via agent port and expose their titles', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' }),
          ),
        },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: { getOrCreateSubthreadByAlias: async () => 'child-t' } as unknown as AgentsPersistenceService,
        },
        RunSignalsRegistry,
      ],
    }).compile();

    class FakeAgentWithTools extends FakeAgent {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
      override getPortConfig() {
        return {
          sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } },
          targetPorts: { $self: { kind: 'instance' } },
        } as const;
      }
    }

    const moduleRef = module.get(ModuleRef);
    const registry = new TemplateRegistry(moduleRef);

    registry
      .register('agent', { title: 'Agent', kind: 'agent' }, FakeAgentWithTools)
      .register('manageTool', { title: 'Manage', kind: 'tool' }, ManageToolNode);

    const runtimeModule = await Test.createTestingModule({
      providers: [
        LiveGraphRuntime,
        LoggerService,
        { provide: TemplateRegistry, useValue: registry },
        {
          provide: GraphRepository,
          useValue: {
            initIfNeeded: async () => {},
            get: async () => null,
            upsert: async () => {
              throw new Error('not-implemented');
            },
            upsertNodeState: async () => {},
          },
        },
        { provide: ModuleRef, useValue: moduleRef },
        {
          provide: AgentsPersistenceService,
          useValue: { getOrCreateSubthreadByAlias: async () => 'child-t' } as unknown as AgentsPersistenceService,
        },
        RunSignalsRegistry,
      ],
    }).compile();
    const runtime = await runtimeModule.resolve(LiveGraphRuntime);

    const graph = {
      nodes: [
        { id: 'A', data: { template: 'agent', config: { title: 'Alpha' } } },
        { id: 'B', data: { template: 'agent', config: { title: 'Beta' } } },
        { id: 'M', data: { template: 'manageTool', config: { description: 'desc' } } },
      ],
      edges: [
        { source: 'M', sourceHandle: 'agent', target: 'A', targetHandle: '$self' },
        { source: 'M', sourceHandle: 'agent', target: 'B', targetHandle: '$self' },
      ],
    };

    await runtime.apply(graph);
    const nodes = runtime.getNodes();
    const toolNode = (nodes as LiveNode[]).find((n) => n.id === 'M');
    if (!toolNode) throw new Error('Manage tool node not found');
    const inst = toolNode.instance;
    if (!(inst instanceof ManageToolNode)) throw new Error('Instance is not ManageToolNode');

    const manageNode = inst as ManageToolNode;
    expect(manageNode.listWorkers().sort()).toEqual(['Alpha', 'Beta']);
  });
});
