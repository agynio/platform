import { describe, expect, it, vi } from 'vitest';

import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { LoggerService } from '../src/core/services/logger.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { VaultRef } from '../src/vault/vault.service';

vi.mock('@slack/socket-mode', () => {
  class MockSocket {
    on() {}
    async start() {}
    async disconnect() {}
  }
  return { SocketModeClient: MockSocket };
});

const makeTrigger = async (overrides: {
  sendToThread?: (threadId: string, text: string) => Promise<import('../src/messaging/types').SendResult>;
  slackSend?: (input: { token: string; channel: string; text: string; thread_ts?: string }) => Promise<import('../src/messaging/types').SendResult>;
  prismaThread?: unknown;
}) => {
  const descriptor = overrides.prismaThread ?? {
    type: 'slack',
    version: 1,
    identifiers: { channel: 'C1', thread_ts: 'root-1' },
  };

  type PrismaClientStub = {
    thread: {
      findUnique: (args: { where: { id: string }; select: { channel: true } }) => Promise<{ channel: unknown | null }>;
    };
  };
  const prismaStub = ({
    getClient: () => ({
      thread: {
        findUnique: async () => ({ channel: descriptor }) as { channel: unknown | null },
      },
    } as PrismaClientStub),
  } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;

  const vaultMock = ({
    getSecret: async (_ref: VaultRef) => 'xoxb-bot',
  } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;

  class SlackAdapterStub implements SlackAdapter {
    constructor(private readonly impl: typeof overrides.slackSend | undefined) {}
    async sendText(input: { token: string; channel: string; text: string; thread_ts?: string }) {
      if (this.impl) return this.impl(input);
      return { ok: true, channelMessageId: 'msg-1', threadId: 'root-1' };
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
    new SlackAdapterStub(overrides.slackSend),
  );
  await trigger.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-bot', source: 'static' } });
  await trigger.provision();
  if (overrides.sendToThread) {
    vi.spyOn(trigger, 'sendToThread').mockImplementation(overrides.sendToThread);
  }
  return trigger;
};

describe('SendMessageFunctionTool error paths', () => {
  it('returns tool_execution_error when trigger throws', async () => {
    const trigger = await makeTrigger({
      sendToThread: async () => {
        throw new TypeError('boom');
      },
    });
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);

    const res = await tool.execute({ message: 'hello' }, { threadId: 't1' });

    expect(JSON.parse(res)).toEqual({ ok: false, error: 'tool_execution_error' });
    await trigger.deprovision();
  });

  it('serializes SendResult when adapter errors inside trigger', async () => {
    const trigger = await makeTrigger({
      slackSend: async () => {
        throw new TypeError('adapter broke');
      },
    });
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);

    const res = await tool.execute({ message: 'thread message' }, { threadId: 't1' });

    expect(() => JSON.parse(res)).not.toThrow();
    const parsed = JSON.parse(res);
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.error === 'string').toBe(true);
    await trigger.deprovision();
  });

  it('requires threadId context', async () => {
    const trigger = await makeTrigger({});
    const tool = new SendMessageFunctionTool(new LoggerService(), trigger);

    const res = await tool.execute({ message: 'hi' }, { threadId: undefined as unknown as string });

    expect(JSON.parse(res)).toEqual({ ok: false, error: 'missing_thread_context' });
    await trigger.deprovision();
  });
});
