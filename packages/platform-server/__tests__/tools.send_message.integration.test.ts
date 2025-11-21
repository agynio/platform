import { describe, it, expect, vi } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';
import { LoggerService } from '../src/core/services/logger.service';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { VaultRef } from '../src/vault/vault.service';
import type { ModuleRef } from '@nestjs/core';

// Mock slack web api
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

  it('returns tool_invalid_response when trigger result is malformed', async () => {
    const triggerStub = ({
      sendToThread: vi.fn().mockResolvedValueOnce({ notOk: true }),
    } satisfies Pick<SlackTrigger, 'sendToThread'>) as SlackTrigger;
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const tool = new SendMessageFunctionTool(logger, triggerStub);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-1' });
    const obj = JSON.parse(res);
    expect(obj).toEqual({ ok: false, error: 'tool_invalid_response' });
    expect(triggerStub.sendToThread).toHaveBeenCalledWith('thread-1', 'hello');
    expect(errorSpy).toHaveBeenCalledWith('SendMessageFunctionTool invalid send result', { threadId: 'thread-1', result: { notOk: true } });
  });

  it('propagates trigger errors and logs error object', async () => {
    const triggerStub = ({
      sendToThread: vi.fn().mockRejectedValueOnce(new Error('boom')),
    } satisfies Pick<SlackTrigger, 'sendToThread'>) as SlackTrigger;
    const logger = new LoggerService();
    const errorSpy = vi.spyOn(logger, 'error');
    const tool = new SendMessageFunctionTool(logger, triggerStub);
    const res = await tool.execute({ message: 'hello' }, { threadId: 'thread-2' });
    const obj = JSON.parse(res);
    expect(obj).toEqual({ ok: false, error: 'boom' });
    expect(errorSpy).toHaveBeenCalled();
    const call = errorSpy.mock.calls.at(0);
    expect(call?.[0]).toBe('SendMessageFunctionTool execute failed');
    expect(call?.[1]).toBeInstanceOf(Error);
    expect((call?.[1] as Error).message).toBe('boom');
    expect(call?.[2]).toEqual({ threadId: 'thread-2' });
  });
});

describe('SendMessageNode', () => {
  it('resolves SlackTrigger lazily via ModuleRef', () => {
    const triggerStub = ({
      sendToThread: vi.fn(),
    } satisfies Pick<SlackTrigger, 'sendToThread'>) as SlackTrigger;
    const moduleRef = ({ get: vi.fn(() => triggerStub) } satisfies Pick<ModuleRef, 'get'>) as ModuleRef;
    const node = new SendMessageNode(new LoggerService(), moduleRef);

    const tool = node.getTool();
    expect(moduleRef.get).toHaveBeenCalledWith(SlackTrigger, { strict: false });
    expect(tool).toBeInstanceOf(SendMessageFunctionTool);
    expect(node.getTool()).toBe(tool);
  });
});
