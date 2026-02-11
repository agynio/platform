import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';

import { ResponseMessage, AIMessage } from '@agyn/llm';

import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { Signal } from '../src/signal';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { LLMContext } from '../src/llm/types';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';

class StubLLMProvisioner extends LLMProvisioner {
  async init(): Promise<void> {}
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
  async teardown(): Promise<void> {}
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
  const defaultSetThreadChannel = vi.fn();
  const hasCustomPersistence = Object.prototype.hasOwnProperty.call(options, 'persistence');
  const persistence = hasCustomPersistence
    ? (options.persistence as AgentsPersistenceService)
    : ({
        getOrCreateSubthreadByAlias: defaultSpy,
        setThreadChannelNode: defaultSetThreadChannel,
      } as unknown as AgentsPersistenceService);
  const linking = {
    registerParentToolExecution: vi.fn().mockResolvedValue('evt-manage'),
  };

  const module = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({
            agentsDatabaseUrl: 'postgres://localhost/agents',
            litellmBaseUrl: 'http://localhost:4000',
            litellmMasterKey: 'sk-test',
          }),
        ),
      },
      { provide: LLMProvisioner, useClass: StubLLMProvisioner },
      ManageFunctionTool,
      ManageToolNode,
      FakeAgent,
      { provide: AgentsPersistenceService, useValue: persistence },
      RunSignalsRegistry,
      { provide: CallAgentLinkingService, useValue: linking },
      { provide: ReferenceResolverService, useValue: createReferenceResolverStub().stub },
    ],
  }).compile();

  const node = await module.resolve(ManageToolNode);
  node.init({ nodeId: 'manage' });
  await node.setConfig({ description: 'desc' });
  const tool = node.getTool();

  const awaitedResponses = new Map<string, string>();
  const awaitSpy = vi
    .spyOn(node, 'awaitChildResponse')
    .mockImplementation(async (childThreadId: string) => {
      const trimmed = childThreadId.trim();
      if (awaitedResponses.has(trimmed)) return awaitedResponses.get(trimmed)!;
      return `ok-${trimmed}`;
    });

  const setAwaitedResponse = (childThreadId: string, responseText: string) => {
    awaitedResponses.set(childThreadId, responseText);
  };

  return {
    module,
    node,
    tool,
    spy: hasCustomPersistence ? null : defaultSpy,
    defaultSetThreadChannel,
    setAwaitedResponse,
    awaitSpy,
    linking,
  };
}

type WorkerConfigInput = string | { name: string; role?: string; title?: string };

async function addWorker(
  module: Awaited<ReturnType<typeof createHarness>>['module'],
  node: ManageToolNode,
  input: WorkerConfigInput,
) {
  const worker = await module.resolve(FakeAgent);
  const normalizedName = typeof input === 'string' ? input.trim() : input.name.trim();
  const normalizedRole = typeof input === 'string' ? undefined : input.role?.trim();
  const normalizedTitle =
    typeof input === 'string'
      ? input.trim()
      : input.title !== undefined
        ? input.title.trim()
        : input.name.trim();
  await worker.setConfig({ name: normalizedName, role: normalizedRole, title: normalizedTitle });
  node.addWorker(worker);
  return worker;
}

describe('ManageTool unit', () => {
  it('send_message: sanitizes explicit threadAlias before persistence', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-explicit');
    const setThreadChannelNode = vi.fn();
    const persistence = {
      getOrCreateSubthreadByAlias,
      setThreadChannelNode,
    } as unknown as AgentsPersistenceService;
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

    expect(res).toBe('Response from: child-1\nok-child-explicit');
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith(
      'manage',
      'Mixed.Alias-Case_123',
      'parent',
      '',
    );
    expect(setThreadChannelNode).toHaveBeenCalledWith('child-explicit', 'manage');
    expect(harness.linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: 'run',
      parentThreadId: 'parent',
      childThreadId: 'child-explicit',
      toolName: 'manage',
    });
  });

  it('send_message: derives sanitized alias when omitted', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-derived');
    const setThreadChannelNode = vi.fn();
    const persistence = {
      getOrCreateSubthreadByAlias,
      setThreadChannelNode,
    } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence });
    await addWorker(harness.module, harness.node, 'Alpha Worker');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      { command: 'send_message', worker: 'Alpha Worker', message: 'ping' },
      ctx,
    );

    expect(res).toBe('Response from: Alpha Worker\nok-child-derived');
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'alpha-worker', 'parent', '');
    expect(setThreadChannelNode).toHaveBeenCalledWith('child-derived', 'manage');
    expect(harness.linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: 'run',
      parentThreadId: 'parent',
      childThreadId: 'child-derived',
      toolName: 'manage',
    });
  });

  it('send_message: prefixes multi-line worker response preserving content', async () => {
    const harness = await createHarness();
    const worker = await addWorker(harness.module, harness.node, 'Multi Worker');
    vi.spyOn(worker, 'invoke').mockResolvedValue(
      new ResponseMessage({ output: [AIMessage.fromText('line 1\nline 2').toPlain()] }),
    );
    harness.setAwaitedResponse('child-default', 'line 1\nline 2');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      { command: 'send_message', worker: 'Multi Worker', message: 'compose' },
      ctx,
    );

    expect(res).toBe('Response from: Multi Worker\nline 1\nline 2');
  });

  it('send_message: omits newline when worker response text is empty', async () => {
    const harness = await createHarness();
    const worker = await addWorker(harness.module, harness.node, 'Empty Worker');
    vi.spyOn(worker, 'invoke').mockResolvedValue(
      new ResponseMessage({ output: [AIMessage.fromText('').toPlain()] }),
    );
    harness.setAwaitedResponse('child-default', '');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      { command: 'send_message', worker: 'Empty Worker', message: 'noop' },
      ctx,
    );

    expect(res).toBe('Response from: Empty Worker');
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

  it('ManageToolNode normalizes names and enforces uniqueness', async () => {
    const harness = await createHarness();

    const explicit = await addWorker(harness.module, harness.node, 'Alpha');
    expect(harness.node.listWorkers()).toEqual(['Alpha']);
    expect(() => harness.node.addWorker(explicit)).not.toThrow();

    const profile = await harness.module.resolve(FakeAgent);
    await profile.setConfig({ name: ' Bravo ', role: ' Strategist ' });
    harness.node.addWorker(profile);
    expect(harness.node.listWorkers()).toEqual(['Alpha', 'Bravo']);

    const noProfile = await harness.module.resolve(FakeAgent);
    await noProfile.setConfig({});
    expect(() => harness.node.addWorker(noProfile)).toThrow(
      'ManageToolNode: worker agent requires non-empty name',
    );

    const nameOnly = await harness.module.resolve(FakeAgent);
    await nameOnly.setConfig({ name: 'Gamma' });
    harness.node.addWorker(nameOnly);
    expect(harness.node.listWorkers()).toEqual(['Alpha', 'Bravo', 'Gamma']);

    const roleOnly = await harness.module.resolve(FakeAgent);
    await roleOnly.setConfig({ role: 'Dispatcher' });
    expect(() => harness.node.addWorker(roleOnly)).toThrow('ManageToolNode: worker agent requires non-empty name');

    const dup = await harness.module.resolve(FakeAgent);
    await dup.setConfig({ name: 'Bravo', role: 'Strategist' });
    expect(() => harness.node.addWorker(dup)).toThrow('ManageToolNode: worker with name "Bravo" already exists');

    harness.node.removeWorker(explicit);
    expect(harness.node.listWorkers()).toEqual(['Bravo', 'Gamma']);
  });

  it('ManageToolNode rejects duplicate names even when roles differ', async () => {
    const harness = await createHarness();
    await harness.node.setConfig({ description: 'desc' });

    const builder = await harness.module.resolve(FakeAgent);
    await builder.setConfig({ name: 'Worker X', role: 'Builder' });
    harness.node.addWorker(builder);

    const reviewer = await harness.module.resolve(FakeAgent);
    await reviewer.setConfig({ name: 'Worker X', role: 'Reviewer' });
    expect(() => harness.node.addWorker(reviewer)).toThrow('ManageToolNode: worker with name "Worker X" already exists');
  });

  it('ManageToolNode refreshes cached names when worker config changes', async () => {
    const harness = await createHarness();

    const worker = await addWorker(harness.module, harness.node, { name: 'Worker One', role: 'Reviewer', title: 'Initial Title' });
    expect(harness.node.listWorkers()).toEqual(['Worker One']);

    await worker.setConfig({ name: 'Worker Prime', role: 'Reviewer', title: 'Prime Title' });

    expect(harness.node.listWorkers()).toEqual(['Worker Prime']);
    expect(harness.node.getWorkerByName('Worker Prime')).toBe(worker);
  });

  it('send_message: surfaces child agent failure', async () => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({
              agentsDatabaseUrl: 'postgres://localhost/agents',
              litellmBaseUrl: 'http://localhost:4000',
              litellmMasterKey: 'sk-test',
            }),
          ),
        },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            getOrCreateSubthreadByAlias: async () => 'child-t',
            setThreadChannelNode: async () => undefined,
          } as unknown as AgentsPersistenceService,
        },
        RunSignalsRegistry,
        { provide: CallAgentLinkingService, useValue: { registerParentToolExecution: vi.fn() } },
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    node.init({ nodeId: 'manage' });
    await node.setConfig({ description: 'desc' });

    class ThrowingAgent extends FakeAgent {
      override async invoke(): Promise<ResponseMessage> {
        throw new Error('child failure');
      }
    }

    const failingAgent = new ThrowingAgent(
      module.get(ConfigService),
      module.get(LLMProvisioner),
      module.get(ModuleRef),
    );
    await failingAgent.setConfig({ name: 'W', title: 'W' });
    node.addWorker(failingAgent);

    const tool = node.getTool();
    const ctx = buildCtx({ threadId: 'p' });
    const waiterSpy = vi
      .spyOn(node, 'awaitChildResponse')
      .mockResolvedValue('Agent run failed: child failure');

    await expect(
      tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx),
    ).resolves.toBe('Response from: W\nAgent run failed: child failure');

    expect(waiterSpy).toHaveBeenCalledWith('child-t', expect.any(Number));
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to agents via agent port and expose their titles', async () => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({
              agentsDatabaseUrl: 'postgres://localhost/agents',
              litellmBaseUrl: 'http://localhost:4000',
              litellmMasterKey: 'sk-test',
            }),
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
        { provide: CallAgentLinkingService, useValue: { registerParentToolExecution: vi.fn() } },
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
        { provide: ReferenceResolverService, useValue: createReferenceResolverStub().stub },
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
        { id: 'A', data: { template: 'agent', config: { name: 'Alpha', title: 'Alpha' } } },
        { id: 'B', data: { template: 'agent', config: { name: 'Beta', title: 'Beta' } } },
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
