import { describe, it, expect, vi } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { SendResult } from '../src/messaging/types';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';

const baseConfig = { app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } } as const;

const makeLogger = () =>
  ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies Pick<LoggerService, 'info' | 'debug' | 'warn' | 'error'>) as LoggerService;

type ThreadRow = { channel: unknown | null } | null;

const setupTrigger = async ({
  thread,
  adapterResult,
  botToken = 'xoxb-bot-token',
}: {
  thread: ThreadRow;
  adapterResult?: SendResult | undefined;
  botToken?: string | null;
}) => {
  const findUnique = vi.fn(async () => thread);
  const prismaClient = { thread: { findUnique } };
  const prismaService = ({
    getClient: () => prismaClient,
  } satisfies Pick<PrismaService, 'getClient'>) as PrismaService;

  const sendText = vi.fn(async () => adapterResult as SendResult);
  const slackAdapter = ({ sendText } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;

  const trigger = new SlackTrigger(
    makeLogger(),
    ({ getSecret: vi.fn() } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService,
    ({
      getOrCreateThreadByAlias: vi.fn(),
      updateThreadChannelDescriptor: vi.fn(),
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService,
    prismaService,
    slackAdapter,
  );
  await trigger.setConfig(baseConfig);
  if (botToken !== undefined) {
    (trigger as unknown as { botToken: string | null }).botToken = botToken;
  }
  return { trigger, sendText, findUnique };
};

describe('SlackTrigger.sendToThread', () => {
  it('returns adapter result on success', async () => {
    const descriptor = {
      type: 'slack',
      version: 1,
      identifiers: { channel: 'C1', thread_ts: 'T1' },
    } satisfies Record<string, unknown>;
    const adapterResult: SendResult = { ok: true, channelMessageId: 'msg-1', threadId: 'T1' };
    const { trigger, sendText } = await setupTrigger({ thread: { channel: descriptor }, adapterResult, botToken: 'xoxb-token' });

    const res = await trigger.sendToThread('thread-1', 'Hello world');

    expect(res).toEqual(adapterResult);
    expect(sendText).toHaveBeenCalledWith({ token: 'xoxb-token', channel: 'C1', text: 'Hello world', thread_ts: 'T1' });
  });

  it('returns missing_channel_descriptor when descriptor absent', async () => {
    const { trigger, sendText } = await setupTrigger({ thread: { channel: null }, botToken: 'xoxb-token' });

    await expect(trigger.sendToThread('thread-null', 'Message')).resolves.toEqual({ ok: false, error: 'missing_channel_descriptor' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns invalid_channel_descriptor for malformed descriptor', async () => {
    const malformed = { type: 'slack' };
    const { trigger, sendText } = await setupTrigger({ thread: { channel: malformed }, botToken: 'xoxb-token' });

    await expect(trigger.sendToThread('thread-invalid', 'Ping')).resolves.toEqual({ ok: false, error: 'invalid_channel_descriptor' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns slacktrigger_unprovisioned when bot token missing', async () => {
    const descriptor = {
      type: 'slack',
      version: 1,
      identifiers: { channel: 'C1', thread_ts: 'T1' },
    } satisfies Record<string, unknown>;
    const { trigger, sendText } = await setupTrigger({ thread: { channel: descriptor }, botToken: null });

    await expect(trigger.sendToThread('thread-1', 'Hello')).resolves.toEqual({ ok: false, error: 'slacktrigger_unprovisioned' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns adapter_invalid_response when adapter result is falsy', async () => {
    const descriptor = {
      type: 'slack',
      version: 1,
      identifiers: { channel: 'C1', thread_ts: 'T1' },
    } satisfies Record<string, unknown>;
    const { trigger } = await setupTrigger({ thread: { channel: descriptor }, adapterResult: undefined, botToken: 'xoxb-token' });

    await expect(trigger.sendToThread('thread-1', 'Hello')).resolves.toEqual({ ok: false, error: 'adapter_invalid_response' });
  });
});
