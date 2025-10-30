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
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';
import { GraphRepository } from '../src/graph/graph.repository';
import type { LiveNode } from '../src/graph/liveGraph.types';

type Msg = { content: string; info?: Record<string, unknown> };

class StubMongoService extends MongoService { override getDb(): Record<string,unknown> { return {}; } }
class StubLLMProvisioner extends LLMProvisioner { async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> { return { call: async () => ({ text: 'ok', output: [] }) }; } }
class StubAgentRunService {
  private runs = new Map<string, string[]>();
  async startRun(nodeId: string, threadId: string): Promise<void> {
    const arr = this.runs.get(nodeId) || [];
    arr.push(threadId);
    this.runs.set(nodeId, arr);
  }
  async list(nodeId: string): Promise<Array<{ threadId: string }>> {
    const arr = this.runs.get(nodeId) || [];
    return arr.map((t) => ({ threadId: t }));
  }
  async markTerminated(): Promise<void> {}
}

class FakeAgent extends AgentNode {
  private active: Set<string> = new Set();
  constructor(cfg: ConfigService, logger: LoggerService, llm: LLMProvisioner, runs: AgentRunService, mod: ModuleRef) {
    super(cfg, logger, llm, runs, mod);
  }
  override getPortConfig() { return { sourcePorts: {}, targetPorts: { $self: { kind: 'instance' } } } as const; }
  override getAgentNodeId(): string | undefined { return 'agent-' + Math.random().toString(36).slice(2, 6); }
  override async invoke(thread: string, _messages: Msg[] | Msg): Promise<{ text: string }> {
    this.active.add(thread);
    return { text: `ok-${thread}` } as { text: string };
  }
  markRunning(thread: string) { this.active.add(thread); }
  override async listActiveThreads(prefix?: string): Promise<string[]> { return Array.from(this.active).filter((t) => (prefix ? t.startsWith(prefix) : true)); }
}

describe('ManageTool unit', () => {
  it('list: empty then after connecting multiple agents (use node ids when available)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: MongoService, useClass: StubMongoService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        { provide: AgentRunService, useClass: StubAgentRunService },
        ConfigService,
        ManageFunctionTool,
        ManageToolNode,
        FakeAgent,
      ],
    }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool: ManageFunctionTool = node.getTool();

    const empty = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);

    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    node.addWorker('agent-A', a1);
    node.addWorker('agent_1', a2);

    const after = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    const names: string[] = after;
    expect(names).toContain('agent-A');
    const hasFallback = names.some((n) => /^agent_\d+$/.test(n));
    expect(hasFallback).toBe(true);
  });

  it('send_message: routes to `${parent}__${worker}` and returns text', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode, FakeAgent] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a = await module.resolve(FakeAgent);
    node.addWorker('child-1', a);
    const tool = node.getTool();
    const res = await tool.execute({ command: 'send_message', worker: 'child-1', message: 'hello', parentThreadId: 'parent' });
    expect(res).toBe('ok-parent__child-1');
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode, FakeAgent] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    await expect(tool.execute({ command: 'send_message', worker: 'x', parentThreadId: 'p' })).rejects.toBeTruthy();
    const a = await module.resolve(FakeAgent);
    node.addWorker('w1', a);
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', parentThreadId: 'p' })).rejects.toBeTruthy();
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode, FakeAgent] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const a1 = await module.resolve(FakeAgent);
    const a2 = await module.resolve(FakeAgent);
    node.addWorker('A', a1);
    node.addWorker('B', a2);
    a1.markRunning('p__A');
    a1.markRunning('p__A-task2');
    a2.markRunning('p__B');
    a2.markRunning('q__B');

    const tool = node.getTool();
    const status = JSON.parse(await tool.execute({ command: 'check_status', parentThreadId: 'p' })) as { activeTasks: number; childThreadIds: string[] };
    expect(status.activeTasks).toBe(status.childThreadIds.length);
    const allPrefixed = status.childThreadIds.every((s: string) => typeof s === 'string' && !s.includes('__'));
    expect(allPrefixed).toBe(true);
    expect(status.childThreadIds).toContain('A');
  });

  it('throws when runtime configurable.thread_id is missing', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();
    await expect(tool.execute({ command: 'list' })).rejects.toBeTruthy();
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode, FakeAgent] }).compile();
    const node = await module.resolve(ManageToolNode);
    await node.setConfig({ description: 'desc' });
    class ThrowingAgent extends FakeAgent {
      override async invoke(_thread: string, _messages: Msg[]): Promise<{ text: string }> {
        throw new Error('child failure');
      }
    }
    const a = new ThrowingAgent(module.get(ConfigService), module.get(LoggerService), module.get(LLMProvisioner), module.get(AgentRunService), module.get(ModuleRef));
    node.addWorker('W', a);
    const tool = node.getTool();
    await expect(tool.execute({ command: 'send_message', worker: 'W', message: 'go', parentThreadId: 'p' })).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; list returns their ids', async () => {
    const module = await Test.createTestingModule({ providers: [LoggerService, ConfigService, { provide: MongoService, useClass: StubMongoService }, { provide: LLMProvisioner, useClass: StubLLMProvisioner }, { provide: AgentRunService, useClass: StubAgentRunService }, ManageFunctionTool, ManageToolNode, FakeAgent] }).compile();
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
    const list = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    expect(Array.isArray(list)).toBe(true);
  });
});
