import { describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@agyn/llm';
import { AgentIngressService } from '../src/messaging/manage/agentIngress.service';
import type { ThreadsQueryService } from '../src/threads/threads.query.service';
import type { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { AgentNode } from '../src/nodes/agent/agent.node';

const makeProxyAgent = () => {
  const agent = {
    status: 'ready',
    invoke: vi.fn(async () => undefined),
  } as unknown as AgentNode & { status: 'ready' | string; invoke: ReturnType<typeof vi.fn> };
  Object.setPrototypeOf(agent, AgentNode.prototype);
  return agent;
};

describe('AgentIngressService', () => {
  it('invokes agent node when ready', async () => {
    const threadsQuery = {
      getThreadAgentNodeId: vi.fn(async () => 'agent-1'),
    } as unknown as ThreadsQueryService & {
      getThreadAgentNodeId: ReturnType<typeof vi.fn>;
    };
    const agent = makeProxyAgent();
    const runtime = {
      getNodeInstance: vi.fn(() => agent),
    } as unknown as LiveGraphRuntime & { getNodeInstance: ReturnType<typeof vi.fn> };

    const service = new AgentIngressService(threadsQuery, runtime);
    const res = await service.enqueueToAgent({
      parentThreadId: 'parent-thread',
      text: 'From Worker Alpha: hello',
      childThreadId: 'child-thread',
      agentTitle: 'Worker Alpha',
      runId: 'child-run',
    });

    expect(res).toEqual({ ok: true });
    expect(agent.invoke).toHaveBeenCalledTimes(1);
    const [threadId, messages] = agent.invoke.mock.calls[0] as [string, HumanMessage[]];
    expect(threadId).toBe('parent-thread');
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[0].text).toBe('From Worker Alpha: hello');
  });

  it('returns error when agent is not ready', async () => {
    const threadsQuery = {
      getThreadAgentNodeId: vi.fn(async () => 'agent-1'),
    } as unknown as ThreadsQueryService & {
      getThreadAgentNodeId: ReturnType<typeof vi.fn>;
    };
    const agent = makeProxyAgent();
    agent.status = 'provisioning';
    const runtime = {
      getNodeInstance: vi.fn(() => agent),
    } as unknown as LiveGraphRuntime & { getNodeInstance: ReturnType<typeof vi.fn> };

    const service = new AgentIngressService(threadsQuery, runtime);
    const res = await service.enqueueToAgent({
      parentThreadId: 'parent-thread',
      text: 'child message',
      childThreadId: 'child-thread',
      agentTitle: 'Worker Alpha',
      runId: null,
    });

    expect(res).toEqual({ ok: false, error: 'agent_not_ready' });
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it('returns error when agent node missing', async () => {
    const threadsQuery = {
      getThreadAgentNodeId: vi.fn(async () => null),
    } as unknown as ThreadsQueryService & {
      getThreadAgentNodeId: ReturnType<typeof vi.fn>;
    };
    const runtime = {
      getNodeInstance: vi.fn(() => null),
    } as unknown as LiveGraphRuntime & { getNodeInstance: ReturnType<typeof vi.fn> };

    const service = new AgentIngressService(threadsQuery, runtime);
    const res = await service.enqueueToAgent({
      parentThreadId: 'parent-thread',
      text: 'child message',
      childThreadId: 'child-thread',
      agentTitle: 'Worker Alpha',
      runId: null,
    });

    expect(res).toEqual({ ok: false, error: 'agent_node_not_found' });
    expect(runtime.getNodeInstance).not.toHaveBeenCalled();
  });

  it('returns error when runtime node is not an agent', async () => {
    const threadsQuery = {
      getThreadAgentNodeId: vi.fn(async () => 'agent-1'),
    } as unknown as ThreadsQueryService & {
      getThreadAgentNodeId: ReturnType<typeof vi.fn>;
    };
    const runtime = {
      getNodeInstance: vi.fn(() => ({ status: 'ready' })),
    } as unknown as LiveGraphRuntime & { getNodeInstance: ReturnType<typeof vi.fn> };

    const service = new AgentIngressService(threadsQuery, runtime);
    const res = await service.enqueueToAgent({
      parentThreadId: 'parent-thread',
      text: 'child message',
      childThreadId: 'child-thread',
      agentTitle: 'Worker Alpha',
      runId: null,
    });

    expect(res).toEqual({ ok: false, error: 'agent_node_unavailable' });
  });
});
