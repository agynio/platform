import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
// Avoid importing PrismaService to prevent prisma client load
import { SlackTrigger } from '../src/graph/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { VaultRef } from '../src/vault/vault.service';

// Mock slack web api
import { vi } from 'vitest';
vi.mock('@slack/web-api', () => {
  class WebClient {}
  (WebClient.prototype as unknown as { chat: { postMessage: ReturnType<typeof vi.fn> } }).chat = {
    postMessage: vi.fn(async (opts: { channel: string; text: string; thread_ts?: string }) => ({ ok: true, channel: opts.channel, ts: '2001', message: { thread_ts: opts.thread_ts || '2001' } })),
  };
  return { WebClient };
});

describe('send_message tool', () => {
  it('returns error when descriptor missing', async () => {
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } as any;
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => undefined };
    const slackAdapterMock = { sendText: async () => ({ ok: true, channelMessageId: '2001', threadId: '2001' }) } as unknown as SlackAdapter;
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock as unknown as import('../src/vault/vault.service').VaultService,
      {} as any,
      prismaStub,
      slackAdapterMock,
    );
    const cfg = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    // Configure trigger-scoped token (static to avoid vault parsing in test)
    const descriptor = { type: 'slack', identifiers: { channel: 'C1' }, meta: {}, version: 1 };
    const prismaStub2 = { getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor }) } }) } as any;
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => 'xoxb-abc' };
    const slackAdapterMock2 = { sendText: async (opts: { channel: string }) => ({ ok: true, channelMessageId: '2001', threadId: '2001' }) } as unknown as SlackAdapter;
    const trigger = new SlackTrigger(
      new LoggerService(),
      vaultMock as unknown as import('../src/vault/vault.service').VaultService,
      {} as any,
      prismaStub2,
      slackAdapterMock2,
    );
    const cfg2 = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } };
    await trigger.setConfig(cfg2);
    await trigger.provision();
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);
    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });
});
