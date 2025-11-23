import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import type Node from '../src/nodes/base/Node';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';

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
      postMessage: vi.fn(async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({ ok: true, channel: opts.channel, ts: '2001', message: { thread_ts: opts.thread_ts || '2001' } })),
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

  const makeRuntimeStub = (instance: unknown): LiveGraphRuntime =>
    ({
      getNodeInstance: vi.fn(() => instance as Node | undefined),
    } satisfies Partial<LiveGraphRuntime>) as LiveGraphRuntime;

  const makeTrigger = async (
    prismaService: import('../src/core/services/prisma.service').PrismaService,
    options: { descriptor?: unknown; sendResult?: import('../src/messaging/types').SendResult },
  ) => {
    const descriptor = options.descriptor ?? { type: 'slack', identifiers: { channel: 'C1', thread_ts: '123' }, meta: {}, version: 1 };
    const sendResult = options.sendResult ?? { ok: true, channelMessageId: '2001', threadId: '2001' };

    const vault = ({ getSecret: vi.fn(async () => 'xoxb-abc') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't1',
      updateThreadChannelDescriptor: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const slackSend = vi.fn(async () => sendResult);
    const slackAdapter = ({ sendText: slackSend } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trigger = new SlackTrigger(new LoggerService(), vault, persistence, prismaService, slackAdapter);
    trigger.init({ nodeId: 'channel-node' });

    // Override prisma behavior for descriptor lookup inside sendToChannel
    const client = prismaService.getClient();
    const originalFindUnique = client.thread.findUnique;
    client.thread.findUnique = vi.fn(async (args: { select: Record<string, boolean> }) => {
      if (args.select?.channel) return { channel: descriptor };
      return originalFindUnique(args);
    });

    await trigger.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } });
    await trigger.provision();
    return { trigger, slackSend };
  };

  it('returns error when thread channel mapping missing', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: null });
    const runtime = makeRuntimeStub(undefined);
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'missing_channel_node' });
  });

  it('returns error when runtime instance missing', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'node-x' });
    const runtime = makeRuntimeStub(undefined);
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'channel_node_unavailable' });
  });

  it('returns error when runtime node is not SlackTrigger', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'node-x' });
    const runtime = makeRuntimeStub({});
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'invalid_channel_type' });
  });

  it('returns error when trigger is not ready', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const vault = ({ getSecret: vi.fn(async () => 'xoxb-abc') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't1',
      updateThreadChannelDescriptor: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const slackAdapter = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trigger = new SlackTrigger(new LoggerService(), vault, persistence, prismaService, slackAdapter);
    trigger.init({ nodeId: 'channel-node' });
    const runtime = makeRuntimeStub(trigger);
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slacktrigger_unprovisioned' });
  });

  it('propagates SlackTrigger send errors', async () => {
    const { prismaService, state } = makePrismaStub({ channelNodeId: 'channel-node' });
    state.channel = null;
    const { trigger } = await makeTrigger(prismaService, { descriptor: null, sendResult: { ok: false, error: 'missing_channel_descriptor' } });
    const runtime = makeRuntimeStub(trigger);
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'missing_channel_descriptor' });
  });

  it('sends via SlackTrigger when ready', async () => {
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });
    const { trigger, slackSend } = await makeTrigger(prismaService, {});
    const runtime = makeRuntimeStub(trigger);
    const tool = new SendMessageFunctionTool(new LoggerService(), prismaService, runtime);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    const obj = JSON.parse(res);
    expect(obj).toEqual({ ok: true, channelMessageId: '2001', threadId: '2001' });
    expect(slackSend).toHaveBeenCalledWith({ token: 'xoxb-abc', channel: 'C1', text: 'hello', thread_ts: '123' });
  });

  it('returns runtime_unavailable when TemplateRegistry instantiates without runtime binding', async () => {
    const loggerStub = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const { prismaService } = makePrismaStub({ channelNodeId: 'channel-node' });

    const testingModule = await Test.createTestingModule({
      providers: [TemplateRegistry, SendMessageNode],
    })
      .useMocker((token) => {
        if (typeof token === 'function' && token.name === 'LoggerService') return loggerStub;
        if (typeof token === 'function' && token.name === 'PrismaService') return prismaService;
        return undefined;
      })
      .compile();

    const registry = testingModule.get(TemplateRegistry);
    registry.register(
      'sendMessageTool',
      { title: 'Send Message', kind: 'tool' },
      SendMessageNode,
    );

    await expect(registry.toSchema()).resolves.not.toThrow();

    const nodeCtor = registry.getClass('sendMessageTool');
    expect(nodeCtor).toBe(SendMessageNode);

    const node = await testingModule.get(ModuleRef).create<SendMessageNode>(nodeCtor as typeof SendMessageNode);
    const result = await node.getTool().execute({ message: 'hello' }, { threadId: 'thread-1' });

    expect(JSON.parse(result)).toEqual({ ok: false, error: 'runtime_unavailable' });
    expect(loggerStub.error).toHaveBeenCalledWith('SendMessageFunctionTool: runtime unavailable', {
      threadId: 'thread-1',
    });

    await testingModule.close();
  });
});
