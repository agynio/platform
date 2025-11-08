import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { SlackTrigger } from '../src/graph/nodes/slackTrigger/slackTrigger.node';
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
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } as unknown as PrismaService;
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => undefined };
    const trigger = new SlackTrigger(new LoggerService(), vaultMock as unknown as import('../src/vault/vault.service').VaultService, {} as any, prismaStub);
    await trigger.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } });
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger as any);
    const res = await tool.execute({ text: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    // Configure trigger-scoped token
    const descriptor = { type: 'slack', identifiers: { channel: 'C1' }, meta: {}, version: 1 };
    const prismaStub2 = { getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor }) } }) } as unknown as PrismaService;
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => 'xoxb-abc' };
    const trigger = new SlackTrigger(new LoggerService(), vaultMock as unknown as import('../src/vault/vault.service').VaultService, {} as any, prismaStub2);
    await trigger.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'vault' } });
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger as any);
    const res = await tool.execute({ message: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });
});
