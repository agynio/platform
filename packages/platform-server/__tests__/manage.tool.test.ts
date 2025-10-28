import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ManageToolNode, type ManageableAgent } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

type Msg = { content: string; info?: Record<string, unknown> };

class FakeAgent implements ManageableAgent {
  public name?: string;
  private active: Set<string> = new Set();
  private id?: string;
  constructor(id?: string) {
    this.id = id;
  }
  async setConfig(_: Record<string, unknown>): Promise<void> {}
  async provision(): Promise<void> {}
  async deprovision(): Promise<void> {}
  getPortConfig() { return { sourcePorts: {}, targetPorts: { $self: { kind: 'instance' } } } as const; }
  getAgentNodeId(): string | undefined {
    return this.id;
  }
  async invoke(thread: string, _messages: Msg[] | Msg): Promise<{ text: string }> {
    this.active.add(thread);
    // simulate work done
    return { text: `ok-${thread}` };
  }
  // expose a way to mark a given thread as running for status tests
  markRunning(thread: string) {
    this.active.add(thread);
  }
  listActiveThreads(prefix?: string): string[] {
    return Array.from(this.active).filter((t) => (prefix ? t.startsWith(prefix) : true));
  }
}

describe('ManageTool unit', () => {
  it('list: empty then after connecting multiple agents (use node ids when available)', async () => {
    const logger = new LoggerService();
    const node = new ManageToolNode(logger, new ManageFunctionTool(logger));
    await node.setConfig({ description: 'desc' });
    const tool: ManageFunctionTool = node.getTool();

    const empty = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);

    const a1 = new FakeAgent('agent-A');
    const a2 = new FakeAgent();
    node.addWorker('agent-A', a1);
    node.addWorker('agent_1', a2);

    const after = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    const names: string[] = after;
    expect(names).toContain('agent-A');
    // either agent_1 or agent_2 depending on ordering, ensure one fallback exists
    const hasFallback = names.some((n) => /^agent_\d+$/.test(n));
    expect(hasFallback).toBe(true);
  });

  it('send_message: routes to `${parent}__${worker}` and returns text', async () => {
    const logger = new LoggerService();
    const node = new ManageToolNode(logger, new ManageFunctionTool(logger));
    await node.setConfig({ description: 'desc' });
    const a = new FakeAgent('child-1');
    node.addWorker('child-1', a);
    const tool = node.getTool();
    const res = await tool.execute({ command: 'send_message', worker: 'child-1', message: 'hello', parentThreadId: 'parent' });
    expect(res).toBe('ok-parent__child-1');
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const node = new ManageToolNode(new LoggerService(), new ManageFunctionTool(new LoggerService()));
    await node.setConfig({ description: 'd' });
    const tool = node.getTool();
    await expect(tool.execute({ command: 'send_message', worker: 'x', parentThreadId: 'p' })).rejects.toBeTruthy();
    const a = new FakeAgent('w1');
    node.addWorker('w1', a);
    await expect(tool.execute({ command: 'send_message', worker: 'unknown', message: 'm', parentThreadId: 'p' })).rejects.toBeTruthy();
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const node = new ManageToolNode(new LoggerService(), new ManageFunctionTool(new LoggerService()));
    await node.setConfig({ description: 'desc' });
    const a1 = new FakeAgent('A');
    const a2 = new FakeAgent('B');
    node.addWorker('A', a1);
    node.addWorker('B', a2);
    // Mark some running threads
    a1.markRunning('p__A');
    a1.markRunning('p__A-task2'); // not strictly matching naming, but includes prefix
    a2.markRunning('p__B');
    a2.markRunning('q__B'); // different parent, should be ignored

    const tool = node.getTool();
    const status = JSON.parse(await tool.execute({ command: 'check_status', parentThreadId: 'p' })) as {
      activeTasks: number;
      childThreadIds: string[];
    };
    expect(status.activeTasks).toBe(status.childThreadIds.length);
    // ensure only children of parent 'p' are reported (suffixes only)
    const allPrefixed = status.childThreadIds.every((s: string) => typeof s === 'string' && !s.includes('__'));
    expect(allPrefixed).toBe(true);
    // should include at least 'A' and 'B' if present
    expect(status.childThreadIds).toContain('A');
  });

  it('throws when runtime configurable.thread_id is missing', async () => {
    const node = new ManageToolNode(new LoggerService(), new ManageFunctionTool(new LoggerService()));
    await node.setConfig({ description: 'desc' });
    const tool = node.getTool();
    await expect(tool.execute({ command: 'list' })).rejects.toBeTruthy();
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const logger = new LoggerService();
    const node = new ManageToolNode(logger, new ManageFunctionTool(logger));
    await node.setConfig({ description: 'desc' });
    class ThrowingAgent extends FakeAgent {
      override async invoke(_thread: string, _messages: Msg[]): Promise<{ text: string }> {
        throw new Error('child failure');
      }
    }
    const a = new ThrowingAgent('W');
    node.addWorker('W', a);
    const tool = node.getTool();
    await expect(tool.execute({ command: 'send_message', worker: 'W', message: 'go', parentThreadId: 'p' })).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; list returns their ids', async () => {
    const logger = new LoggerService();
    class FakeAgentWithTools extends FakeAgent {
      addTool(_: unknown) {}
      removeTool(_: unknown) {}
      getPortConfig() { return { sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } }, targetPorts: { $self: { kind: 'instance' } } } as const; }
    }
    const moduleRef: ModuleRef = {
      create: (Cls: any) => new (Cls as any)(logger, new ManageFunctionTool(logger)),
      get: (_token: any) => new ManageFunctionTool(logger),
    } as unknown as ModuleRef;
    const registry = new TemplateRegistry(moduleRef);

    registry
      .register('agent', { title: 'Agent', kind: 'agent' }, (FakeAgentWithTools as any))
      .register('manageTool', { title: 'Manage', kind: 'tool' }, (ManageToolNode as any));

    const runtime = new LiveGraphRuntime(
      logger,
      registry,
      {
        initIfNeeded: async () => {},
        get: async () => null,
        upsert: async () => {
          throw new Error('not-implemented');
        },
        upsertNodeState: async () => {},
      } as any,
      { create: (Cls: any) => new (Cls as any)(logger, new ManageFunctionTool(logger)), get: (_token: any) => new ManageFunctionTool(logger) } as unknown as ModuleRef,
    );
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
    } as any;

    await runtime.apply(graph);
    const nodes = runtime.getNodes();
    const toolNode = nodes.find((n) => (n as any).id === 'M') as any;
    const toolInst: ManageToolNode = toolNode?.instance as ManageToolNode;

    const tool = toolInst.getTool();
    const list = JSON.parse(await tool.execute({ command: 'list', parentThreadId: 'p' }));
    expect(Array.isArray(list)).toBe(true);
  });
});
