import { describe, it, expect } from 'vitest';
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

describe('ManageTool unit', () => {
  it('send_message: matches worker by trimmed title and returns text', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const worker = await module.resolve(FakeAgent);
    await worker.setConfig({ title: '  child-1  ' });
    node.addWorker(worker);
    expect(node.listWorkers()).toEqual(['child-1']);

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'parent', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const res = await tool.execute({ command: 'send_message', worker: ' child-1 ', message: 'hello', threadAlias: 'child-1' }, ctx);
    expect(res?.startsWith('ok-')).toBe(true);
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };

    await expect(tool.execute({ command: 'send_message', worker: 'x', threadAlias: 'alias-x' }, ctx)).rejects.toThrow('No agents connected');

    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: 'w1' });
    node.addWorker(agent);

    await expect(tool.execute({ command: 'send_message', worker: 'x', threadAlias: 'alias-x' }, ctx)).rejects.toThrow('message is required for send_message');
    await expect(tool.execute({ command: 'send_message', worker: '   ', message: 'hi', threadAlias: 'alias-x' }, ctx)).rejects.toThrow('worker is required for send_message');
    await expect(tool.execute({ command: 'send_message', worker: 'w1', message: '   ', threadAlias: 'alias-x' }, ctx)).rejects.toThrow('message is required for send_message');
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', threadAlias: 'alias-unknown' }, ctx)).rejects.toThrow('Unknown worker: unknown');
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const agentA = await module.resolve(FakeAgent);
    const agentB = await module.resolve(FakeAgent);
    await agentA.setConfig({ title: 'A' });
    await agentB.setConfig({ title: 'B' });
    node.addWorker(agentA);
    node.addWorker(agentB);

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const statusStr = await tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const status = JSON.parse(statusStr) as { activeTasks: number; childThreadIds: string[] };
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('ManageToolNode enforces titled workers and handles retitle/removal', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });

    const first = await module.resolve(FakeAgent);
    await first.setConfig({ title: 'Alpha' });
    node.addWorker(first);
    expect(node.listWorkers()).toEqual(['Alpha']);

    const noTitle = await module.resolve(FakeAgent);
    await noTitle.setConfig({});
    expect(() => node.addWorker(noTitle)).toThrow('ManageToolNode: worker agent requires non-empty title');

    const dup = await module.resolve(FakeAgent);
    await dup.setConfig({ title: '  Alpha  ' });
    expect(() => node.addWorker(dup)).toThrow('ManageToolNode: worker with title "Alpha" already exists');

    await first.setConfig({ title: ' Beta ' });
    expect(node.listWorkers()).toEqual(['Beta']);
    expect(node.getWorkerByTitle('Beta')).toBe(first);

    node.removeWorker(first);
    expect(node.listWorkers()).toEqual([]);
  });

  it('send_message: surfaces child agent failure', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
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
    const failingAgent = new ThrowingAgent(module.get(ConfigService), module.get(LoggerService), module.get(LLMProvisioner), module.get(ModuleRef));
    await failingAgent.setConfig({ title: 'W' });
    node.addWorker(failingAgent);

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx)).rejects.toThrow('child failure');
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to agents via agent port and expose their titles', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    class FakeAgentWithTools extends FakeAgent {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
      override getPortConfig() {
        return { sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } }, targetPorts: { $self: { kind: 'instance' } } } as const;
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
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => {},
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async () => 'child-t',
          },
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
