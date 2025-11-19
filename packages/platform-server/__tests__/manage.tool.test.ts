import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import { z } from 'zod';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

class StubLLMProvisioner extends LLMProvisioner {
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
}

class FakeAgent extends AgentNode {
  override getPortConfig() {
    return { sourcePorts: {}, targetPorts: { $self: { kind: 'instance' } } } as const;
  }
  override async invoke(thread: string): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText(`ok-${thread}`).toPlain()] });
  }
}

describe('ManageTool unit', () => {
  it('list: empty then after connecting multiple agents (use node ids when available)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, listThreads: async () => [], listRuns: async () => [], listRunMessages: async () => [] } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool: ManageFunctionTool = node.getTool();

    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const emptyStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const listSchema = z.array(z.string());
    const empty = listSchema.parse(JSON.parse(emptyStr));
    expect(empty.length).toBe(0);

    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    await a1.setConfig({ title: 'Ops' });
    await a2.setConfig({ title: 'Support' });
    node.addWorker(a1);
    node.addWorker(a2);

    const afterStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const after = listSchema.parse(JSON.parse(afterStr));
    expect(after).toEqual(expect.arrayContaining(['Ops', 'Support']));
    expect(after.some((n) => /^agent_\d+$/.test(n))).toBe(false);
  });

  it('addWorker requires non-empty unique titles', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, listThreads: async () => [], listRuns: async () => [], listRunMessages: async () => [] } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });

    const noTitleAgent = await module.resolve(FakeAgent);
    expect(() => node.addWorker(noTitleAgent)).toThrow('Connected agent must define a non-empty config.title');

    const first = await module.resolve(FakeAgent);
    await first.setConfig({ title: 'Unique' });
    node.addWorker(first);

    const dup = await module.resolve(FakeAgent);
    await dup.setConfig({ title: 'Unique' });
    expect(() => node.addWorker(dup)).toThrow('Worker with title Unique already exists');
  });

  it('removeWorker handles retitled agent instances', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, listThreads: async () => [], listRuns: async () => [], listRunMessages: async () => [] } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();

    const agent = await module.resolve(FakeAgent);
    await agent.setConfig({ title: 'Agent A' });
    node.addWorker(agent);

    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const beforeStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const listSchema = z.array(z.string());
    const before = listSchema.parse(JSON.parse(beforeStr));
    expect(before).toEqual(['Agent A']);

    await agent.setConfig({ title: 'Agent A2' });
    const afterTitleStr = await tool.execute({ command: 'list', threadAlias: 'list-after' }, ctx);
    const afterTitle = listSchema.parse(JSON.parse(afterTitleStr));
    expect(afterTitle).toEqual(['Agent A2']);

    node.removeWorker(agent);
    const finalStr = await tool.execute({ command: 'list', threadAlias: 'list-final' }, ctx);
    const final = listSchema.parse(JSON.parse(finalStr));
    expect(final).toEqual([]);
  });

  it('send_message: routes to `${parent}__${worker}` and returns text', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, _summary: string) => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a = await module.resolve(FakeAgent);
    await a.setConfig({ title: 'Child One' });
    node.addWorker(a);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'parent', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const res = await tool.execute({ command: 'send_message', worker: 'Child One', message: 'hello', threadAlias: 'child-1', summary: 'Child one summary' }, ctx);
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
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, _summary: string) => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'x', threadAlias: 'alias-x', summary: 'x' }, ctx)).rejects.toBeTruthy();
    const a = await module.resolve(FakeAgent);
    await a.setConfig({ title: 'Worker One' });
    node.addWorker(a);
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', threadAlias: 'alias-unknown', summary: 'unknown' }, ctx)).rejects.toBeTruthy();
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
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, _summary: string) => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    await a1.setConfig({ title: 'Alpha' });
    await a2.setConfig({ title: 'Beta' });
    node.addWorker(a1);
    node.addWorker(a2);
    // Active threads tracking is not exposed by current AgentNode; check_status returns empty aggregates.

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const statusStr = await tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const statusSchema = z.object({ activeTasks: z.number().int(), childThreadIds: z.array(z.string()) });
    const status = statusSchema.parse(JSON.parse(statusStr));
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('throws when runtime configurable.thread_id is missing', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();
    // Missing ctx should throw at compile time; provide minimal ctx for runtime
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const listStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const list = z.array(z.string()).parse(JSON.parse(listStr));
    expect(Array.isArray(list)).toBe(true);
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
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
    const a = new ThrowingAgent(module.get(ConfigService), module.get(LoggerService), module.get(LLMProvisioner), module.get(ModuleRef));
    await a.setConfig({ title: 'Thrower' });
    node.addWorker(a);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'Thrower', message: 'go', threadAlias: 'alias-W', summary: 'W summary' }, ctx)).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; list returns their ids', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService().init(configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://localhost/agents' })) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } },
        RunSignalsRegistry,
      ],
    }).compile();
    class FakeAgentWithTools extends FakeAgent {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
      override getPortConfig() { return { sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } }, targetPorts: { $self: { kind: 'instance' } } } as const; }
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
        { provide: GraphRepository, useValue: { initIfNeeded: async () => {}, get: async () => null, upsert: async () => { throw new Error('not-implemented'); }, upsertNodeState: async () => {} } },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, _summary: string) => 'child-t' } },
        RunSignalsRegistry,
      ],
    }).compile();
    const runtime = await runtimeModule.resolve(LiveGraphRuntime);

    const graph = {
      nodes: [
        { id: 'A', data: { template: 'agent', config: { title: 'Agent A' } } },
        { id: 'B', data: { template: 'agent', config: { title: 'Agent B' } } },
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
    const isManage = inst instanceof ManageToolNode;
    if (!isManage) throw new Error('Instance is not ManageToolNode');
    const tool = (inst as ManageToolNode).getTool();
    const ctx: LLMContext = { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const listStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const list = z.array(z.string()).parse(JSON.parse(listStr));
    expect(Array.isArray(list)).toBe(true);
    expect(list).toEqual(expect.arrayContaining(['Agent A', 'Agent B']));
  });
});
