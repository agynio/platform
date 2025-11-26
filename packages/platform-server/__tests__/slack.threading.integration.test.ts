import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';

type ChannelDescriptor = import('../src/messaging/types').ChannelDescriptor;

type SlackMessageEvent = {
  type: 'message';
  user: string;
  channel: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel_type?: string;
};

type SlackEnvelope = {
  envelope_id: string;
  ack: () => Promise<void>;
  body: { type: 'event_callback'; event: SlackMessageEvent };
};

class DescriptorStore {
  private descriptors = new Map<string, ChannelDescriptor>();
  private aliases = new Map<string, string>();

  getOrCreateThread(alias: string): string {
    const existing = this.aliases.get(alias);
    if (existing) return existing;
    const id = `thread-${alias}`;
    this.aliases.set(alias, id);
    return id;
  }

  getDescriptor(threadId: string): ChannelDescriptor | null {
    return this.descriptors.get(threadId) ?? null;
  }

  setDescriptor(threadId: string, descriptor: ChannelDescriptor): void {
    if (!this.descriptors.has(threadId)) {
      this.descriptors.set(threadId, descriptor);
    }
  }
}

vi.mock('@slack/socket-mode', () => {
  let last: MockClient | null = null;
  class MockClient {
    handlers: { message?: Array<(env: SlackEnvelope) => Promise<void> | void> } = {};
    constructor() {
      last = this;
    }
    on(ev: string, fn: (env: SlackEnvelope) => Promise<void> | void) {
      if (ev !== 'message') return;
      this.handlers.message = this.handlers.message || [];
      this.handlers.message.push(fn);
    }
    async start() {}
    async disconnect() {}
  }
  const __getLastSocketClient = () => last;
  return { SocketModeClient: MockClient, __getLastSocketClient };
});

declare module '@slack/socket-mode' {
  export function __getLastSocketClient(): { handlers: { message?: Array<(env: SlackEnvelope) => Promise<void> | void> } } | null;
}
import { __getLastSocketClient } from '@slack/socket-mode';

describe('SlackTrigger threading integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const setup = async (store: DescriptorStore) => {
    const getOrCreateThreadByAlias = vi.fn(async (_src: string, alias: string) => store.getOrCreateThread(alias));
    const updateThreadChannelDescriptor = vi.fn(async (threadId: string, descriptor: ChannelDescriptor) => {
      store.setDescriptor(threadId, descriptor);
    });
    const persistence = ({
      getOrCreateThreadByAlias,
      updateThreadChannelDescriptor,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({
      getClient: () => ({
        thread: {
          findUnique: async ({ where: { id } }: { where: { id: string } }) => ({ channel: store.getDescriptor(id) }),
        },
      }),
    } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackSend = vi.fn(async (opts: { token: string; channel: string; text: string; thread_ts?: string }) => ({ ok: true, channelMessageId: '200', threadId: opts.thread_ts ?? 'generated-thread' }));
    const slackAdapter = ({ sendText: slackSend } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trigger = new SlackTrigger(undefined as any, persistence, prismaStub, slackAdapter);
    trigger.init({ nodeId: 'slack-node' });
    await trigger.setConfig({ app_token: 'xapp-abc', bot_token: 'xoxb-bot' });
    await trigger.provision();
    const client = __getLastSocketClient();
    if (!client || !(client.handlers.message || []).length) throw new Error('socket not initialized');
    const handler = (client.handlers.message || [])[0]!;
    return {
      trigger,
      handler,
      slackSend,
      getOrCreateThreadByAlias,
      updateThreadChannelDescriptor,
    };
  };

  it('replies to top-level channel messages within the same thread', async () => {
    const store = new DescriptorStore();
    const { handler, trigger, slackSend, updateThreadChannelDescriptor } = await setup(store);
    const ack = vi.fn(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'env1',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'U1',
          channel: 'C1',
          text: 'hello world',
          ts: '1000.1',
          channel_type: 'channel',
        },
      },
    };
    await handler(env);
    const threadId = 'thread-U1_1000.1';
    await trigger.sendToChannel(threadId, 'ack');
    expect(slackSend).toHaveBeenCalledWith({ token: 'xoxb-bot', channel: 'C1', text: 'ack', thread_ts: '1000.1' });
    const descriptor = store.getDescriptor(threadId);
    expect(descriptor?.identifiers.thread_ts).toBe('1000.1');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledTimes(1);
  });

  it('keeps reply events in their originating Slack thread', async () => {
    const store = new DescriptorStore();
    const { handler, trigger, slackSend, updateThreadChannelDescriptor } = await setup(store);
    const topLevelAck = vi.fn(async () => {});
    await handler({
      envelope_id: 'env-top',
      ack: topLevelAck,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'U2',
          channel: 'C2',
          text: 'root text',
          ts: '2000.9',
          channel_type: 'im',
        },
      },
    });
    expect(updateThreadChannelDescriptor).toHaveBeenCalledTimes(1);
    const ack = vi.fn(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'env2',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'U2',
          channel: 'C2',
          text: 'reply text',
          ts: '1001.5',
          thread_ts: '2000.9',
          channel_type: 'im',
        },
      },
    };
    await handler(env);
    const threadId = 'thread-U2_2000.9';
    await trigger.sendToChannel(threadId, 'follow-up');
    expect(slackSend).toHaveBeenCalledWith({ token: 'xoxb-bot', channel: 'C2', text: 'follow-up', thread_ts: '2000.9' });
    const descriptor = store.getDescriptor(threadId);
    expect(descriptor?.identifiers.thread_ts).toBe('2000.9');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledTimes(1);
  });
});
