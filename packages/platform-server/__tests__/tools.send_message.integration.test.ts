import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ThreadTransportService } from '../src/messaging/threadTransport.service';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

// Mock slack web api
import { vi } from 'vitest';
vi.mock('@slack/socket-mode', () => {
  class MockSocket {
    on() {}
    async start() {}
    async disconnect() {}
  }
  return { SocketModeClient: MockSocket };
});
vi.mock('@slack/web-api', () => {
  type ChatPostMessageArguments = { channel: string; text: string; thread_ts?: string };
  type ChatPostMessageResponse = { ok: boolean; channel?: string; ts?: string; message?: { thread_ts?: string } };
  class WebClient {
    chat = {
      postMessage: vi.fn(async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({
        ok: true,
        channel: opts.channel,
        ts: '2001',
        message: { thread_ts: opts.thread_ts || '2001' },
      })),
    };
  }
  return { WebClient };
});

describe('send_message tool', () => {
  const makePrismaStub = (options: { channelNodeId?: string | null; channel?: unknown | null }) => {
    const state = {
      channelNodeId: options.channelNodeId === undefined ? 'channel-node' : options.channelNodeId,
      channel: options.channel === undefined ? null : options.channel,
    };
    const threadFindUnique = vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
      if (select.channelNodeId) {
        if (!state.channelNodeId) return null;
        return { channelNodeId: state.channelNodeId };
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

  const makeTrigger = async (
    prismaService: import('../src/core/services/prisma.service').PrismaService,
    options: { descriptor?: unknown; sendResult?: import('../src/messaging/types').SendResult },
  ) => {
    const descriptor = options.descriptor ?? {
      type: 'slack',
      identifiers: { channel: 'C1', thread_ts: '123' },
      meta: {},
      version: 1,
    };
    const sendResult = options.sendResult ?? { ok: true, channelMessageId: '2001', threadId: '2001' };

    const persistence = ({
      getOrCreateThreadByAlias: async () => 't1',
      updateThreadChannelDescriptor: async () => undefined,
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const slackSend = vi.fn(async () => sendResult);
    const slackAdapter = ({ sendText: slackSend } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const { stub: referenceResolver } = createReferenceResolverStub();
    const trigger = new SlackTrigger(referenceResolver, persistence, prismaService, slackAdapter, runtimeStub, templateRegistryStub);
    trigger.init({ nodeId: 'channel-node' });

    // Override prisma behavior for descriptor lookup inside sendToChannel
    const client = prismaService.getClient();
    const originalFindUnique = client.thread.findUnique;
    client.thread.findUnique = vi.fn(async (args: { select: Record<string, boolean> }) => {
      if (args.select?.channel) return { channel: descriptor };
      return originalFindUnique(args);
    });

    await trigger.setConfig({ app_token: 'xapp-abc', bot_token: 'xoxb-abc' });
    await trigger.provision();
    return { trigger, slackSend };
  };

  it('returns error when thread channel mapping missing', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: null });
    const runtime = makeRuntimeStub();
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('missing_channel_node');
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

  it('returns error when runtime node is not SlackTrigger', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'node-x' });
    const runtime = makeRuntimeStub({ 'node-x': {} });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('unsupported_channel_node');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('returns error when trigger is not ready', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't1',
      updateThreadChannelDescriptor: async () => undefined,
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const slackAdapter = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const { stub: referenceResolver } = createReferenceResolverStub();
    const trigger = new SlackTrigger(referenceResolver, persistence, prismaService, slackAdapter, runtimeStub, templateRegistryStub);
    trigger.init({ nodeId: 'channel-node' });
    const runtime = makeRuntimeStub({ 'channel-node': trigger });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('slacktrigger_unprovisioned');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('propagates SlackTrigger send errors', async () => {
    const { prismaService, state } = makePrismaStub({ channelNodeId: 'channel-node' });
    state.channel = null;
    const { trigger } = await makeTrigger(prismaService, {
      descriptor: null,
      sendResult: { ok: false, error: 'missing_channel_descriptor' },
    });
    const runtime = makeRuntimeStub({ 'channel-node': trigger });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    expect(res).toBe('missing_channel_descriptor');
    expect(transportPersistence.recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('sends via SlackTrigger when ready', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const { trigger, slackSend } = await makeTrigger(prismaService, {});
    const runtime = makeRuntimeStub({ 'channel-node': trigger });
    const { transport, persistence: transportPersistence } = makeTransport(prismaService, runtime);
    const tool = new SendMessageFunctionTool(transport);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1', runId: 'run-1' } as any);
    expect(res).toBe('message sent successfully');
    expect(slackSend).toHaveBeenCalledWith({ token: 'xoxb-abc', channel: 'C1', text: 'hello', thread_ts: '123' });
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
