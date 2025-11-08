import { describe, it, expect } from 'vitest';
import { SendMessageFunctionTool } from '../src/graph/nodes/tools/send_message/send_message.tool';
import { LoggerService } from '../src/core/services/logger.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
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
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: null, channelVersion: null }) } }) } as unknown as PrismaService;
    // Minimal env to satisfy ConfigService schema
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
    process.env.MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/test';
    process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'mongodb://localhost:27017/agents';
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => undefined };
    const tool = new SendMessageFunctionTool(new LoggerService(), vaultMock as unknown as import('../src/vault/vault.service').VaultService, prismaStub, ConfigService.fromEnv());
    const res = await tool.execute({ text: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(false);
    expect(obj.error).toBe('missing_channel_descriptor');
  });

  it('sends via slack adapter when descriptor present', async () => {
    // Set env for config and slack token ref
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
    process.env.MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/test';
    process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'mongodb://localhost:27017/agents';
    process.env.SLACK_BOT_TOKEN_REF = process.env.SLACK_BOT_TOKEN_REF || 'secret/slack/bot_token';
    const prismaStub = { getClient: () => ({ thread: { findUnique: async () => ({ channel: { type: 'slack', identifiers: { channelId: 'C1' }, meta: {} }, channelVersion: 1 }) } }) } as unknown as PrismaService;
    const descriptor = { type: 'slack', identifiers: { channelId: 'C1' }, auth: { botToken: { value: 'secret/slack/BOT', source: 'vault' } }, meta: {}, version: 1 };
    const prismaStub2 = { getClient: () => ({ thread: { findUnique: async () => ({ channel: descriptor, channelVersion: 1 }) } }) } as unknown as PrismaService;
    const vaultMock: { getSecret: (ref: VaultRef) => Promise<string | undefined> } = { getSecret: async () => 'xoxb-abc' };
    const tool = new SendMessageFunctionTool(new LoggerService(), vaultMock as unknown as import('../src/vault/vault.service').VaultService, prismaStub2, ConfigService.fromEnv());
    const res = await tool.execute({ message: 'hello' } as any, { threadId: 't1' } as any);
    const obj = JSON.parse(res);
    expect(obj.ok).toBe(true);
    expect(obj.channelMessageId).toBe('2001');
  });
});
