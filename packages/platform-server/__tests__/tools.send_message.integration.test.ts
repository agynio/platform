import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import type { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ThreadTransportService, type ThreadChannelNode } from '../src/messaging/threadTransport.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { SendResult } from '../src/messaging/types';

import { vi } from 'vitest';

describe('send_message tool', () => {
  const makePrismaStub = (options: { channelNodeId?: string | null; channel?: unknown | null; exists?: boolean }) => {
    const state = {
      exists: options.exists === undefined ? true : options.exists,
      channelNodeId: options.channelNodeId === undefined ? 'channel-node' : options.channelNodeId,
      channel: options.channel === undefined ? null : options.channel,
    };
    const threadFindUnique = vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
      if (!state.exists) return null;
      if (select.channelNodeId) {
        return { channelNodeId: state.channelNodeId ?? null };
      }
      if (select.channel) {
        return { channel: state.channel };
      }
      return null;
    });
    const client = { thread: { findUnique: threadFindUnique } };
    const prismaService = ({ getClient: () => client } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    return { prismaService, threadFindUnique, state };
  };

  const makeRuntimeStub = (instances?: Record<string, unknown>) =>
    ({
      getNodeInstance: vi.fn((nodeId: string) => instances?.[nodeId]),
    } satisfies Partial<LiveGraphRuntime>) as LiveGraphRuntime;

  const makeChannelNode = (result: SendResult) =>
    ({ sendToChannel: vi.fn(async () => result) } satisfies ThreadChannelNode);

  it('persists message when thread has no channel node', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: null });
    const runtime = makeRuntimeStub();
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('message sent successfully');
    expect(transportPersistence.recordTransportAssistantMessage).toHaveBeenCalledWith({
      threadId: 't1',
      text: 'hello',
      runId: null,
      source: 'send_message',
    });
  });

  it('returns missing_thread when thread cannot be looked up', async () => {
    const { prismaService } = makePrismaStub({ exists: false });
    const runtime = makeRuntimeStub();
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'missing-thread' } as any);
    expect(res).toBe('missing_thread');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('returns error when runtime instance missing', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'node-x' });
    const runtime = makeRuntimeStub();
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('channel_node_unavailable');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('returns error when runtime node lacks channel adapter', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'node-x' });
    const runtime = makeRuntimeStub({ 'node-x': {} });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('unsupported_channel_node');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });
  it('propagates channel send errors', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const channelNode = makeChannelNode({ ok: false, error: 'missing_channel_descriptor' });
    const runtime = makeRuntimeStub({ 'channel-node': channelNode });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('missing_channel_descriptor');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('sends via channel adapter when ready', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const channelNode = makeChannelNode({ ok: true, channelMessageId: '2001', threadId: '2001' });
    const runtime = makeRuntimeStub({ 'channel-node': channelNode });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1', runId: 'run-1' } as any);
    expect(res).toBe('message sent successfully');
    expect(channelNode.sendToChannel).toHaveBeenCalledWith('t1', 'hello');
    expect(transportPersistence.recordTransportAssistantMessage).toHaveBeenCalledWith({
      threadId: 't1',
      text: 'hello',
      runId: 'run-1',
      source: 'send_message',
    });
  });
});
  const makeTransport = (
    prismaService: import('../src/core/services/prisma.service').PrismaService,
    runtime: LiveGraphRuntime,
    overrides?: Partial<Pick<AgentsPersistenceService, 'recordTransportAssistantMessage'>>,
  ) => {
    const persistence = ({
      recordTransportAssistantMessage: vi.fn(async () => ({ messageId: 'msg-1' })),
      ...overrides,
    } satisfies Pick<AgentsPersistenceService, 'recordTransportAssistantMessage'>) as AgentsPersistenceService;
    return {
      transport: new ThreadTransportService(prismaService, runtime, persistence),
      persistence,
    };
  };
