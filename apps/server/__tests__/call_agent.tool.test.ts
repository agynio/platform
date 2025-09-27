import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { CallAgentTool } from '../src/tools/call_agent.tool';
import { LoggerService } from '../src/services/logger.service';
import { BaseAgent } from '../src/agents/base.agent';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg = { content: string; info: Record<string, unknown> };

class FakeAgent extends BaseAgent {
  constructor(
    logger: LoggerService,
    private responder?: (thread: string, msgs: Msg[]) => Promise<AIMessage>,
  ) {
    super(logger);
    this._graph = { invoke: vi.fn() } as any;
    this._config = { configurable: {} } as any;
  }
  async setConfig(_: Record<string, unknown>): Promise<void> {}
  async invoke(thread: string, messages: Msg[]): Promise<AIMessage> {
    if (this.responder) return this.responder(thread, messages);
    return new AIMessage('OK');
  }
}

class FakeParentAgent extends BaseAgent {
  public calls: Array<{ thread: string; messages: Msg[] }> = [];
  constructor(logger: LoggerService) {
    super(logger);
    this._graph = { invoke: vi.fn() } as any;
    this._config = { configurable: {} } as any;
  }
  async setConfig(_: Record<string, unknown>): Promise<void> {}
  async invoke(thread: string, messages: Msg[]): Promise<AIMessage> {
    this.calls.push({ thread, messages });
    return new AIMessage('ACK');
  }
}

describe('CallAgentTool unit', () => {
  it('returns error when no agent attached', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await expect(tool.setConfig({ description: 'desc' })).resolves.toBeUndefined();
    const dynamic: DynamicStructuredTool = tool.init();
    const out = await dynamic.invoke(
      { input: 'hi', childThreadId: 'x' },
      { configurable: { thread_id: 't1' } } as any,
    );
    expect(out).toBe('Target agent is not connected');
  });

  it('calls attached agent and returns its response.text', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const agent = new FakeAgent(new LoggerService(), async (thread, _msgs) => {
      expect(thread).toBe('t2__sub');
      return new AIMessage('OK');
    });
    tool.setAgent(agent);
    const dynamic = tool.init();
    const out = await dynamic.invoke(
      { input: 'ping', childThreadId: 'sub' },
      { configurable: { thread_id: 't2' } } as any,
    );
    expect(out).toBe('OK');
  });

  it('passes context through info', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const agent = new FakeAgent(new LoggerService(), async (_thread, msgs) => {
      expect(msgs[0]?.info?.deep).toBe(42);
      return new AIMessage('OK');
    });
    tool.setAgent(agent);
    const dynamic = tool.init();
    const out = await dynamic.invoke(
      { input: 'x', context: { deep: 42 }, childThreadId: 'c' },
      { configurable: { thread_id: 't3' } } as any,
    );
    expect(out).toBe('OK');
  });

  it('uses provided description in tool metadata', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'My desc' });
    const dynamic = tool.init();
    expect(dynamic.description).toBe('My desc');
    expect(dynamic.name).toBe('call_agent');
  });

  it('concatenates childThreadId with parent thread_id when provided', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc' });
    const agent = new FakeAgent(new LoggerService(), async (thread, _msgs) => {
      expect(thread).toBe('parent__sub');
      return new AIMessage('OK');
    });
    tool.setAgent(agent);
    const dynamic = tool.init();
    const out = await dynamic.invoke(
      { input: 'ping', childThreadId: 'sub' },
      { configurable: { thread_id: 'parent' } } as any,
    );
    expect(out).toBe('OK');
  });

  it('async mode returns sent immediately and later triggers parent with child result', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'async' });
    const child = new FakeAgent(new LoggerService(), async (thread, msgs) => {
      expect(thread).toBe('p__c1');
      expect(msgs[0]?.content).toBe('do work');
      await sleep(5);
      return new AIMessage('child-complete');
    });
    tool.setAgent(child);
    const parent = new FakeParentAgent(new LoggerService());
    const dynamic = tool.init();
    const res = await dynamic.invoke(
      { input: 'do work', childThreadId: 'c1' },
      { configurable: { thread_id: 'p', caller_agent: parent } } as any,
    );
    expect(typeof res).toBe('object');
    expect((res as any).status).toBe('sent');
    await sleep(15);
    expect(parent.calls.length).toBe(1);
    expect(parent.calls[0]?.thread).toBe('p');
    expect(parent.calls[0]?.messages?.[0]).toEqual({ content: 'child-complete', info: { from: 'agent', childThreadId: 'c1' } });
  });

  it('ignore mode returns sent and does not trigger parent', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'ignore' });
    const child = new FakeAgent(new LoggerService(), async () => {
      await sleep(5);
      return new AIMessage('ignored');
    });
    tool.setAgent(child);
    const parent = new FakeParentAgent(new LoggerService());
    const dynamic = tool.init();
    const res = await dynamic.invoke(
      { input: 'do work', childThreadId: 'c2' },
      { configurable: { thread_id: 'p2', caller_agent: parent } } as any,
    );
    expect(typeof res).toBe('object');
    expect((res as any).status).toBe('sent');
    await sleep(15);
    expect(parent.calls.length).toBe(0);
  });
});

// Graph wiring test

describe('CallAgentTool graph wiring', () => {
  it('wires agent method to tool instance via ports and sets agent', async () => {
    const logger = new LoggerService();

    class FakeAgent2 extends FakeAgent {}

    // Minimal TemplateRegistry with simpleAgent and callAgentTool
    const registry = new TemplateRegistry();
    class FakeAgentWithTools extends FakeAgent2 {
      addTool(_tool: unknown) {}
      removeTool(_tool: unknown) {}
    }

    registry
      .register('simpleAgent', () => new FakeAgentWithTools(logger) as any, {
        sourcePorts: {
          tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
        },
        targetPorts: { $self: { kind: 'instance' } },
      })
      .register('callAgentTool', () => new CallAgentTool(logger), {
        targetPorts: { $self: { kind: 'instance' } },
        sourcePorts: { agent: { kind: 'method', create: 'setAgent' } },
      });

    const runtime = new LiveGraphRuntime(logger, registry);

    const graph = {
      nodes: [
        { id: 'A', data: { template: 'simpleAgent', config: {} } },
        { id: 'B', data: { template: 'simpleAgent', config: {} } },
        { id: 'T', data: { template: 'callAgentTool', config: { description: 'desc' } } },
      ],
      edges: [
        { source: 'A', sourceHandle: 'tools', target: 'T', targetHandle: '$self' },
        { source: 'T', sourceHandle: 'agent', target: 'B', targetHandle: '$self' },
      ],
    };

    await runtime.apply(graph as any);

    // Internal check: edge execution should have recorded connections
    const nodes = runtime.getNodes();
    const toolNode = nodes.find((n) => (n as any).id === 'T') as any;
    const toolInst = toolNode?.instance as unknown as CallAgentTool;

    // @ts-expect-error accessing private for test
    expect(!!toolInst['targetAgent']).toBe(true);
  });
});
