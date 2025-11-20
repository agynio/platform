import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { VaultRef } from '../src/vault/vault.service';

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
  it('returns error when descriptor missing', async () => {
    type PrismaClientStub = { thread: { findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }> } };
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } } as PrismaClientStub) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock = ({ getSecret: async (_ref: VaultRef) => undefined } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    class SlackAdapterStub implements SlackAdapter {
      constructor(private readonly _logger: LoggerService = new LoggerService()) {}
      async sendText(_input: { token: string; channel: string; text: string; thread_ts?: string }): Promise<import('../src/messaging/types').SendResult> {
        return { ok: true, channelMessageId: '2001', threadId: '2001' };
      }
    }
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock,
      ({
        getOrCreateThreadByAlias: async () => 't1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      prismaStub,
      new SlackAdapterStub(),
    );
    const cfg = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    // Configure trigger-scoped token (static to avoid vault parsing in test)
    const descriptor = { type: 'slack', identifiers: { channel: 'C1' }, meta: {}, version: 1 };
    type PrismaClientStub2 = { thread: { findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }> } };
    const prismaStub2 = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor }) } } as PrismaClientStub2) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock2 = ({ getSecret: async (_ref: VaultRef) => 'xoxb-abc' } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    class SlackAdapterStub2 implements SlackAdapter {
      constructor(private readonly _logger: LoggerService = new LoggerService()) {}
      async sendText(_opts: { token: string; channel: string; text: string; thread_ts?: string }): Promise<import('../src/messaging/types').SendResult> {
        return { ok: true, channelMessageId: '2001', threadId: '2001' };
      }
    }
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock2,
      ({
        getOrCreateThreadByAlias: async () => 't1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      prismaStub2,
      new SlackAdapterStub2(),
    );
    const cfg2 = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg2);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });

  it('returns tool_invalid_response when trigger yields invalid result', async () => {
    const descriptor = { type: 'slack', identifiers: { channel: 'C1' }, meta: {}, version: 1 };
    type PrismaClientStub3 = { thread: { findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }> } };
    const prismaStub3 = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor }) } } as PrismaClientStub3) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const vaultMock3 = ({ getSecret: async (_ref: VaultRef) => 'xoxb-abc' } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    class SlackAdapterStub3 implements SlackAdapter {
      constructor(private readonly _logger: LoggerService = new LoggerService()) {}
      async sendText(_opts: { token: string; channel: string; text: string; thread_ts?: string }): Promise<import('../src/messaging/types').SendResult> {
        return { ok: true, channelMessageId: '2001', threadId: '2001' };
      }
    }
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock3,
      ({
        getOrCreateThreadByAlias: async () => 't1',
        updateThreadChannelDescriptor: async () => undefined,
      } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
      prismaStub3,
      new SlackAdapterStub3(),
    );
    const cfg3 = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg3);
    await trigger.provision();
    const sendToThreadSpy = vi.spyOn(trigger, 'sendToThread').mockResolvedValueOnce(undefined as unknown as import('../src/messaging/types').SendResult);
    try {
      const tool = new SendMessageFunctionTool(new LoggerService(), trigger);
      const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });
      const obj = JSON.parse(res);
      expect(obj).toEqual({ ok: false, error: 'tool_invalid_response' });
    } finally {
      sendToThreadSpy.mockRestore();
      await trigger.deprovision();
    }
  });
});
