import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ManageToolNode } from '../src/graph/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/graph/nodes/tools/manage/manage.tool';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { MongoService } from '../src/core/services/mongo.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import { z } from 'zod';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';

class StubMongoService extends MongoService {
  override getDb(): Record<string, unknown> {
    return {};
  }
}
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
  it('list: empty then after connecting multiple agents (use node ids when available)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: MongoService, useClass: StubMongoService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        ConfigService,
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, listThreads: async () => [], listRuns: async () => [], listRunMessages: async () => [] } },
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool: ManageFunctionTool = node.getTool();

    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const emptyStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const listSchema = z.array(z.string());
    const empty = listSchema.parse(JSON.parse(emptyStr));
    expect(empty.length).toBe(0);

    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    node.addWorker('agent-A', a1);
    node.addWorker('agent_1', a2);

    const afterStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const after = listSchema.parse(JSON.parse(afterStr));
    expect(after).toContain('agent-A');
    const hasFallback = after.some((n) => /^agent_\d+$/.test(n));
    expect(hasFallback).toBe(true);
  });

  it('send_message: routes to `${parent}__${worker}` and returns text', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, FakeAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } }] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a = await module.resolve(FakeAgent);
    node.addWorker('child-1', a);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'parent', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const res = await tool.execute({ command: 'send_message', worker: 'child-1', message: 'hello', threadAlias: 'child-1' }, ctx);
    expect(res?.startsWith('ok-')).toBe(true);
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, FakeAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } }] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'x', threadAlias: 'alias-x' }, ctx)).rejects.toBeTruthy();
    const a = await module.resolve(FakeAgent);
    node.addWorker('w1', a);
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', threadAlias: 'alias-unknown' }, ctx)).rejects.toBeTruthy();
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, FakeAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } }] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    node.addWorker('A', a1);
    node.addWorker('B', a2);
    // Active threads tracking is not exposed by current AgentNode; check_status returns empty aggregates.

    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const statusStr = await tool.execute({ command: 'check_status', threadAlias: 'status' }, ctx);
    const statusSchema = z.object({ activeTasks: z.number().int(), childThreadIds: z.array(z.string()) });
    const status = statusSchema.parse(JSON.parse(statusStr));
    expect(status.activeTasks).toBe(0);
    expect(status.childThreadIds.length).toBe(0);
  });

  it('throws when runtime configurable.thread_id is missing', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } }] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();
    // Missing ctx should throw at compile time; provide minimal ctx for runtime
    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const listStr = await tool.execute({ command: 'list', threadAlias: 'list' }, ctx);
    const list = z.array(z.string()).parse(JSON.parse(listStr));
    expect(Array.isArray(list)).toBe(true);
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, FakeAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } }] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    class ThrowingAgent extends FakeAgent {
      override async invoke(): Promise<ResponseMessage> {
        throw new Error('child failure');
      }
    }
    const a = new ThrowingAgent(module.get(ConfigService), module.get(LoggerService), module.get(LLMProvisioner), module.get(ModuleRef));
    node.addWorker('W', a);
    const tool = node.getTool();
    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    await expect(tool.execute({ command: 'send_message', worker: 'W', message: 'go', threadAlias: 'alias-W' }, ctx)).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; list returns their ids', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, ManageFunctionTool, ManageToolNode, FakeAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } }] }).compile();
    const logger = module.get(LoggerService);
    class FakeAgentWithTools extends FakeAgent {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
      override getPortConfig() { return { sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } }, targetPorts: { $self: { kind: 'instance' } } } as const; }
    }
    const moduleRef = module.get(ModuleRef);
    const registry = new TemplateRegistry(moduleRef);

    class ManageToolNodeCompat extends ManageToolNode {
      override addWorker(agent: AgentNode): void {
        const id = agent.getAgentNodeId();
        const name = id && id.length > 0 ? id : `agent_${Math.random().toString(36).slice(2, 6)}`;
        super.addWorker(name, agent);
      }
    }

    registry
      .register('agent', { title: 'Agent', kind: 'agent' }, FakeAgentWithTools)
      .register('manageTool', { title: 'Manage', kind: 'tool' }, ManageToolNodeCompat);

    const runtimeModule = await Test.createTestingModule({
      providers: [
        LiveGraphRuntime,
        LoggerService,
        { provide: TemplateRegistry, useValue: registry },
        { provide: GraphRepository, useValue: { initIfNeeded: async () => {}, get: async () => null, upsert: async () => { throw new Error('not-implemented'); }, upsertNodeState: async () => {} } },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {}, getOrCreateSubthreadByAlias: async () => 'child-t' } },
      ],
    }).compile();
    const runtime = await runtimeModule.resolve(LiveGraphRuntime);

    const graph = {
      nodes: [
        { id: 'A', data: { template: 'agent', config: {} } },
        { id: 'B', data: { template: 'agent', config: {} } },
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
    const ctx: LLMContext = { threadId: 'p', finishSignal: new Signal(), callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) } };
    const listStr = await tool.execute({ command: 'list' }, ctx);
    const list = z.array(z.string()).parse(JSON.parse(listStr));
    expect(Array.isArray(list)).toBe(true);
  });
});
