import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';

import { AIMessage, ResponseMessage } from '@agyn/llm';

import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
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
import { EventsBusService } from '../src/events/events-bus.service';
import { RunEventsService } from '../src/events/run-events.service';
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';

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

const PARENT_THREAD_ID = '11111111-1111-1111-8111-111111111111';
function buildCtx(overrides: Partial<LLMContext> = {}): LLMContext {
  return {
    threadId: PARENT_THREAD_ID,
    runId: 'run',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) },
    ...overrides,
  } as LLMContext;
}

type ManageConfigInput = Parameters<ManageToolNode['setConfig']>[0];

async function createHarness(options: { persistence?: AgentsPersistenceService; config?: ManageConfigInput } = {}) {
  const defaultSpy = vi.fn().mockResolvedValue('child-default');
  const hasCustomPersistence = Object.prototype.hasOwnProperty.call(options, 'persistence');
  const persistence = hasCustomPersistence
    ? (options.persistence as AgentsPersistenceService)
    : ({ getOrCreateSubthreadByAlias: defaultSpy, updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined) } as unknown as AgentsPersistenceService);

  const module = await Test.createTestingModule({
    providers: [
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
      { provide: RunEventsService, useValue: { publishEvent: vi.fn() } as unknown as RunEventsService },
      EventsBusService,
      RunSignalsRegistry,
      { provide: ReferenceResolverService, useValue: createReferenceResolverStub().stub },
    ],
  }).compile();

  const node = await module.resolve(ManageToolNode);
  await node.setConfig({ description: 'desc', ...(options.config ?? {}) });
  const tool = node.getTool();
  const eventsBus = await module.resolve(EventsBusService);

  return { module, node, tool, eventsBus, spy: hasCustomPersistence ? null : defaultSpy };
}

async function addWorker(module: Awaited<ReturnType<typeof createHarness>>['module'], node: ManageToolNode, title: string) {
  const worker = await module.resolve(FakeAgent);
  await worker.setConfig({ title, sendLLMResponseToThread: false });
  node.addWorker(worker);
  return worker;
}

describe('ManageTool unit', () => {
  it('initializes with EventsBusService', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ManageFunctionTool,
        {
          provide: AgentsPersistenceService,
          useValue: {
            getOrCreateSubthreadByAlias: vi.fn(),
            updateThreadChannelDescriptor: vi.fn(),
          } as unknown as AgentsPersistenceService,
        },
        {
          provide: EventsBusService,
          useValue: {
            subscribeToMessageCreated: vi.fn(() => () => undefined),
          } as unknown as EventsBusService,
        },
      ],
    }).compile();

    try {
      const tool = await module.resolve(ManageFunctionTool);
      expect(() => tool.init({} as ManageToolNode)).not.toThrow();
    } finally {
      await module.close();
    }
  });

  it('send_message: uses explicit threadAlias verbatim after trim', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-explicit');
    const updateThreadChannelDescriptor = vi.fn().mockResolvedValue(undefined);
    const persistence = { getOrCreateSubthreadByAlias, updateThreadChannelDescriptor } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence });
    await addWorker(harness.module, harness.node, '  child-1  ');

    const ctx = buildCtx();

    const resultPromise = harness.tool.execute(
      {
        command: 'send_message',
        worker: ' child-1 ',
        message: 'hello',
        threadAlias: '  Mixed.Alias-Case_123  ',
      },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-explicit',
        message: {
          id: 'msg-1',
          kind: 'assistant',
          text: 'ok-child-explicit',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run',
        },
      });
    }, 0);

    const res = await resultPromise;

    expect(res).toBe('Response from: child-1\nok-child-explicit');
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'Mixed.Alias-Case_123', PARENT_THREAD_ID, '');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith('child-explicit', {
      type: 'manage',
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        agentTitle: 'child-1',
        mode: 'sync',
        asyncPrefix: 'From {{agentTitle}}: ',
        showCorrelationInOutput: false,
      },
      createdBy: 'manage-tool',
    });
  });

  it('send_message: derives sanitized alias when omitted', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-derived');
    const updateThreadChannelDescriptor = vi.fn().mockResolvedValue(undefined);
    const persistence = { getOrCreateSubthreadByAlias, updateThreadChannelDescriptor } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence });
    await addWorker(harness.module, harness.node, 'Alpha Worker');

    const ctx = buildCtx();

    const resultPromise = harness.tool.execute(
      { command: 'send_message', worker: 'Alpha Worker', message: 'ping' },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-derived',
        message: {
          id: 'msg-2',
          kind: 'assistant',
          text: 'ok-child-derived',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run-2',
        },
      });
    }, 0);

    const res = await resultPromise;

    expect(res).toBe('Response from: Alpha Worker\nok-child-derived');
    expect(getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'alpha-worker', PARENT_THREAD_ID, '');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith('child-derived', {
      type: 'manage',
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        agentTitle: 'Alpha Worker',
        mode: 'sync',
        asyncPrefix: 'From {{agentTitle}}: ',
        showCorrelationInOutput: false,
      },
      createdBy: 'manage-tool',
    });
  });

  it('send_message: prefixes multi-line worker response preserving content', async () => {
    const harness = await createHarness();
    const worker = await addWorker(harness.module, harness.node, 'Multi Worker');
    vi.spyOn(worker, 'invoke');

    const ctx = buildCtx();
    const resultPromise = harness.tool.execute(
      { command: 'send_message', worker: 'Multi Worker', message: 'compose' },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-default',
        message: {
          id: 'msg-3',
          kind: 'assistant',
          text: 'line 1\nline 2',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run-3',
        },
      });
    }, 0);

    const res = await resultPromise;

    expect(res).toBe('Response from: Multi Worker\nline 1\nline 2');
    expect(worker.invoke).toHaveBeenCalledTimes(1);
  });

  it('send_message: omits newline when worker response text is empty', async () => {
    const harness = await createHarness();
    const worker = await addWorker(harness.module, harness.node, 'Empty Worker');
    vi.spyOn(worker, 'invoke');

    const ctx = buildCtx();
    const resultPromise = harness.tool.execute(
      { command: 'send_message', worker: 'Empty Worker', message: 'noop' },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-default',
        message: {
          id: 'msg-4',
          kind: 'assistant',
          text: '',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run-4',
        },
      });
    }, 0);

    const res = await resultPromise;

    expect(res).toBe('Response from: Empty Worker');
    expect(worker.invoke).toHaveBeenCalledTimes(1);
  });

  it('send_message: includes correlation data when enabled', async () => {
    const getOrCreateSubthreadByAlias = vi.fn().mockResolvedValue('child-corr');
    const updateThreadChannelDescriptor = vi.fn().mockResolvedValue(undefined);
    const persistence = { getOrCreateSubthreadByAlias, updateThreadChannelDescriptor } as unknown as AgentsPersistenceService;
    const harness = await createHarness({ persistence, config: { showCorrelationInOutput: true } });
    await addWorker(harness.module, harness.node, 'Worker Corr');

    const ctx = buildCtx();
    const resultPromise = harness.tool.execute(
      {
        command: 'send_message',
        worker: 'Worker Corr',
        message: 'status',
        threadAlias: 'alias-42',
      },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-corr',
        message: {
          id: 'msg-5',
          kind: 'assistant',
          text: 'ready',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run-5',
        },
      });
    }, 0);

    const res = await resultPromise;
    expect(res).toBe('Response from: Worker Corr [alias=alias-42; thread=child-corr]\nready');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith('child-corr', {
      type: 'manage',
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        agentTitle: 'Worker Corr',
        mode: 'sync',
        asyncPrefix: 'From {{agentTitle}}: ',
        showCorrelationInOutput: true,
      },
      createdBy: 'manage-tool',
    });
  });

  it('send_message: collects multiple responses up to syncMaxMessages', async () => {
    const harness = await createHarness({ config: { syncMaxMessages: 2 } });
    await addWorker(harness.module, harness.node, 'Worker Multi');

    const ctx = buildCtx();
    const resultPromise = harness.tool.execute(
      {
        command: 'send_message',
        worker: 'Worker Multi',
        message: 'fanout',
      },
      ctx,
    );

    setTimeout(() => {
      harness.eventsBus.emitMessageCreated({
        threadId: 'child-default',
        message: {
          id: 'msg-6a',
          kind: 'assistant',
          text: 'first',
          source: { origin: 'test' },
          createdAt: new Date(),
          runId: 'child-run-6',
        },
      });
      setTimeout(() => {
        harness.eventsBus.emitMessageCreated({
          threadId: 'child-default',
          message: {
            id: 'msg-6b',
            kind: 'assistant',
            text: 'second',
            source: { origin: 'test' },
            createdAt: new Date(),
            runId: 'child-run-6',
          },
        });
      }, 1);
    }, 0);

    const res = await resultPromise;
    expect(res).toBe('Response from: Worker Multi\nfirst\n\nsecond');
  });

  it('send_message: throws on timeout without responses', async () => {
    const harness = await createHarness({ config: { syncTimeoutMs: 1000 } });
    await addWorker(harness.module, harness.node, 'Worker Timeout');

    const ctx = buildCtx();
    vi.useFakeTimers();
    try {
      const execution = harness.tool.execute(
        { command: 'send_message', worker: 'Worker Timeout', message: 'wait' },
        ctx,
      );
      void execution.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(execution).rejects.toThrow('Manage: timed out waiting for worker response');
    } finally {
      vi.useRealTimers();
    }
  });

  it('send_message: async mode returns acknowledgement immediately', async () => {
    const harness = await createHarness({ config: { mode: 'async' } });
    await addWorker(harness.module, harness.node, 'Worker Async');

    const ctx = buildCtx();
    const res = await harness.tool.execute(
      { command: 'send_message', worker: 'Worker Async', message: 'async' },
      ctx,
    );

    expect(res).toBe('Message dispatched to Worker Async; responses will arrive asynchronously.');
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

  it('ManageToolNode derives worker titles from profile fields and handles retitle/removal', async () => {
    const harness = await createHarness();

    const explicit = await addWorker(harness.module, harness.node, 'Alpha');
    expect(harness.node.listWorkers()).toEqual(['Alpha']);
    expect(() => harness.node.addWorker(explicit)).not.toThrow();

    const profile = await harness.module.resolve(FakeAgent);
    await profile.setConfig({ name: ' Bravo ', role: ' Strategist ', sendLLMResponseToThread: false });
    harness.node.addWorker(profile);
    expect(harness.node.listWorkers()).toEqual(['Alpha', 'Bravo (Strategist)']);

    const noProfile = await harness.module.resolve(FakeAgent);
    await noProfile.setConfig({ sendLLMResponseToThread: false });
    expect(() => harness.node.addWorker(noProfile)).toThrow(
      'ManageToolNode: worker agent requires non-empty title',
    );

    const nameOnly = await harness.module.resolve(FakeAgent);
    await nameOnly.setConfig({ name: 'Gamma', sendLLMResponseToThread: false });
    harness.node.addWorker(nameOnly);
    expect(harness.node.listWorkers()).toEqual(['Alpha', 'Bravo (Strategist)', 'Gamma']);

    const roleOnly = await harness.module.resolve(FakeAgent);
    await roleOnly.setConfig({ role: 'Dispatcher', sendLLMResponseToThread: false });
    harness.node.addWorker(roleOnly);
    expect(harness.node.listWorkers()).toEqual(['Alpha', 'Bravo (Strategist)', 'Gamma', 'Dispatcher']);

    const dup = await harness.module.resolve(FakeAgent);
    await dup.setConfig({ name: 'Bravo', role: 'Strategist', sendLLMResponseToThread: false });
    expect(() => harness.node.addWorker(dup)).toThrow(
      'ManageToolNode: worker with title "Bravo (Strategist)" already exists',
    );

    await explicit.setConfig({ title: ' Beta ', sendLLMResponseToThread: false });
    expect(harness.node.listWorkers()).toEqual(['Beta', 'Bravo (Strategist)', 'Gamma', 'Dispatcher']);
    expect(harness.node.getWorkerByTitle('Beta')).toBe(explicit);

    harness.node.removeWorker(explicit);
    expect(harness.node.listWorkers()).toEqual(['Bravo (Strategist)', 'Gamma', 'Dispatcher']);
  });

  it('send_message: surfaces child agent failure', async () => {
    const harness = await createHarness();
    const worker = await addWorker(harness.module, harness.node, 'W');
    const dispatchSpy = vi
      .spyOn(ManageFunctionTool.prototype, 'dispatchSync')
      .mockRejectedValue(new Error('child failure'));

    try {
      const ctx = buildCtx();
      await expect(
        harness.tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx),
      ).rejects.toThrow('child failure');
    } finally {
      dispatchSpy.mockRestore();
    }
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to agents via agent port and expose their titles', async () => {
    const harness = await createHarness();
    const moduleRef = harness.module.get(ModuleRef);
    const sanityNode = await moduleRef.resolve(ManageToolNode);
    expect(sanityNode).toBeInstanceOf(ManageToolNode);

    const patchedModuleRef = moduleRef as ModuleRef & {
      create<TInput = unknown, TResult = TInput>(type: TInput): Promise<TResult>;
    };
    patchedModuleRef.create = async <TInput, TResult>(type: TInput): Promise<TResult> =>
      moduleRef.resolve(type as never) as Promise<unknown> as Promise<TResult>;

    const registry = new TemplateRegistry(moduleRef);

    registry
      .register('agent', { title: 'Agent', kind: 'agent' }, FakeAgent)
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

    await runtimeModule.close();
    await harness.module.close();
  });
});
