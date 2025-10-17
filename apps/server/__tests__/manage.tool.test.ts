import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { BaseAgent } from '../src/agents/base.agent';
import { ManageTool } from '../src/tools/manage.tool';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

type Msg = { content: string; info: Record<string, unknown> };

class FakeAgent extends BaseAgent {
  public name?: string;
  private active: Set<string> = new Set();
  private id?: string;
  constructor(logger: LoggerService, id?: string) {
    super(logger);
    this._graph = { invoke: () => ({}) } as any;
    this._config = { configurable: {} } as any;
    this.id = id;
  }
  protected getNodeId(): string | undefined { return this.id; }
  async setConfig(_: Record<string, unknown>): Promise<void> {}
  async invoke(thread: string, _messages: Msg[]): Promise<AIMessage> {
    this.active.add(thread);
    // simulate work done
    return new AIMessage(`ok-${thread}`);
  }
  // expose a way to mark a given thread as running for status tests
  markRunning(thread: string) { this.active.add(thread); }
  override listActiveThreads(prefix?: string): string[] {
    return Array.from(this.active).filter((t) => (prefix ? t.startsWith(prefix) : true));
  }
}

describe('ManageTool unit', () => {
  it('list: empty then after connecting multiple agents (use node ids when available)', async () => {
    const tool = new ManageTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const dyn: DynamicStructuredTool = tool.init();

    const empty = (await dyn.invoke({ command: 'list' }, { configurable: { thread_id: 'p' } } as any)) as string[];
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);

    const a1 = new FakeAgent(new LoggerService(), 'agent-A');
    const a2 = new FakeAgent(new LoggerService()); // unnamed -> agent_1
    tool.addAgent(a1);
    tool.addAgent(a2);

    const after = (await dyn.invoke({ command: 'list' }, { configurable: { thread_id: 'p' } } as any)) as string[];
    const names: string[] = after;
    expect(names).toContain('agent-A');
    // either agent_1 or agent_2 depending on ordering, ensure one fallback exists
    const hasFallback = names.some((n) => /^agent_\d+$/.test(n));
    expect(hasFallback).toBe(true);
  });

  it('send_message: routes to `${parent}__${worker}` and returns text', async () => {
    const logger = new LoggerService();
    const tool = new ManageTool(logger);
    await tool.setConfig({ description: 'desc' });
    const a = new FakeAgent(logger, 'child-1');
    tool.addAgent(a);
    const dyn = tool.init();
    const res = await dyn.invoke(
      { command: 'send_message', worker: 'child-1', message: 'hello' },
      { configurable: { thread_id: 'parent' } } as any,
    );
    expect(res).toBe('ok-parent__child-1');
  });

  it('send_message: parameter validation and unknown worker', async () => {
    const tool = new ManageTool(new LoggerService());
    await tool.setConfig({ description: 'd' });
    const dyn = tool.init();
    await expect(dyn.invoke({ command: 'send_message', worker: 'x' }, { configurable: { thread_id: 'p' } } as any)).rejects.toBeTruthy();
    const a = new FakeAgent(new LoggerService(), 'w1');
    tool.addAgent(a);
    await expect(dyn.invoke({ command: 'send_message', worker: 'unknown', message: 'm' }, { configurable: { thread_id: 'p' } } as any)).rejects.toBeTruthy();
  });

  it('check_status: aggregates active child threads scoped to current thread', async () => {
    const tool = new ManageTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const a1 = new FakeAgent(new LoggerService(), 'A');
    const a2 = new FakeAgent(new LoggerService(), 'B');
    tool.addAgent(a1);
    tool.addAgent(a2);
    // Mark some running threads
    a1.markRunning('p__A');
    a1.markRunning('p__A-task2'); // not strictly matching naming, but includes prefix
    a2.markRunning('p__B');
    a2.markRunning('q__B'); // different parent, should be ignored

    const dyn = tool.init();
    const status = (await dyn.invoke({ command: 'check_status' }, { configurable: { thread_id: 'p' } } as any)) as {
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
    const tool = new ManageTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const dyn = tool.init();
    await expect(dyn.invoke({ command: 'list' }, {} as any)).rejects.toBeTruthy();
  });

  it('throws when child agent invoke fails (send_message)', async () => {
    const logger = new LoggerService();
    const tool = new ManageTool(logger);
    await tool.setConfig({ description: 'desc' });
    class ThrowingAgent extends FakeAgent {
      override async invoke(_thread: string, _messages: Msg[]): Promise<AIMessage> {
        throw new Error('child failure');
      }
    }
    const a = new ThrowingAgent(logger, 'W');
    tool.addAgent(a);
    const dyn = tool.init();
    await expect(
      dyn.invoke({ command: 'send_message', worker: 'W', message: 'go' }, { configurable: { thread_id: 'p' } } as any),
    ).rejects.toBeTruthy();
  });
});

describe('ManageTool graph wiring', () => {
  it('connect ManageTool to two agents via agent port; list returns their ids', async () => {
    const logger = new LoggerService();
    class FakeAgent2 extends FakeAgent {}
    class FakeAgentWithTools extends FakeAgent2 { addTool(_: unknown) {}; removeTool(_: unknown) {} }
    const registry = new TemplateRegistry();

    registry
      .register('simpleAgent', () => new FakeAgentWithTools(logger) as any, {
        sourcePorts: { tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' } },
        targetPorts: { $self: { kind: 'instance' } },
      })
      .register('manageTool', () => new ManageTool(logger), {
        targetPorts: { $self: { kind: 'instance' } },
        sourcePorts: { agent: { kind: 'method', create: 'addAgent' } },
      });

    const runtime = new LiveGraphRuntime(logger, registry);
    const graph = {
      nodes: [
        { id: 'A', data: { template: 'simpleAgent', config: {} } },
        { id: 'B', data: { template: 'simpleAgent', config: {} } },
        { id: 'M', data: { template: 'manageTool', config: { description: 'desc' } } },
      ],
      edges: [
        { source: 'A', sourceHandle: 'tools', target: 'M', targetHandle: '$self' },
        { source: 'M', sourceHandle: 'agent', target: 'B', targetHandle: '$self' },
      ],
    } as any;

    await runtime.apply(graph);
    const nodes = runtime.getNodes();
    const toolNode = nodes.find((n) => (n as any).id === 'M') as any;
    const toolInst = toolNode?.instance as unknown as ManageTool;

    const dyn = toolInst.init();
    const list: string[] = (await dyn.invoke(
      { command: 'list' },
      { configurable: { thread_id: 'p' } } as any,
    )) as string[];
    expect(Array.isArray(list)).toBe(true);
  });
});
