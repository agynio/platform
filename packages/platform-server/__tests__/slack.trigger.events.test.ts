import { describe, it, expect, vi } from 'vitest';
import type { LoggerService } from '../src/core/services/logger.service';
// BaseTrigger legacy removed in Issue #451; use SlackTrigger semantics only
// Typed helper for Slack socket-mode envelope used by our handler
type SlackMessageEvent = {
  type: 'message';
  user: string;
  channel: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel_type?: string;
  client_msg_id?: string;
  event_ts?: string;
  subtype?: string;
};
type SlackEnvelope =
  | {
      envelope_id: string;
      ack: () => Promise<void>;
      body: { type: 'event_callback'; event: SlackMessageEvent };
    }
  | {
      envelope_id: string;
      ack: () => Promise<void>;
      body: { type: 'events_api'; payload: { event: SlackMessageEvent } };
    }
  | {
      envelope_id: string;
      ack: () => Promise<void>;
      event: SlackMessageEvent;
      body?: undefined;
    };
// Mock socket-mode client; SlackTrigger registers a 'message' handler
vi.mock('@slack/socket-mode', () => {
  let last: MockClient | null = null;
  class MockClient {
    // Expose a typed 'message' handlers collection to avoid broad casts
    handlers: { message?: Array<(env: SlackEnvelope) => Promise<void> | void> } = {};
    constructor() { last = this; }
    on(ev: string, fn: (env: SlackEnvelope) => Promise<void> | void) {
      if (ev !== 'message') return; // only route message events in tests
      this.handlers.message = this.handlers.message || [];
      this.handlers.message.push(fn);
    }
    async start() {}
    async disconnect() {}
  }
  const __getLastSocketClient = () => last;
  return { SocketModeClient: MockClient, __getLastSocketClient };
});
vi.mock('@prisma/client', () => {
  class PrismaClient {}
  const AnyNull = Symbol('AnyNull');
  const DbNull = Symbol('DbNull');
  return {
    PrismaClient,
    RunEventType: {
      invocation_message: 'invocation_message',
      injection: 'injection',
      llm_call: 'llm_call',
      tool_execution: 'tool_execution',
      summarization: 'summarization',
    },
    RunEventStatus: {
      pending: 'pending',
      running: 'running',
      success: 'success',
      error: 'error',
      cancelled: 'cancelled',
    },
    ToolExecStatus: {
      pending: 'pending',
      running: 'running',
      success: 'success',
      error: 'error',
    },
    EventSourceKind: {
      agent: 'agent',
      system: 'system',
      tool: 'tool',
      reminder: 'reminder',
      summarizer: 'summarizer',
      user: 'user',
    },
    AttachmentKind: {
      input_text: 'input_text',
      llm_prompt: 'llm_prompt',
      llm_response: 'llm_response',
      tool_input: 'tool_input',
      tool_output: 'tool_output',
      metadata: 'metadata',
    },
    ContextItemRole: {
      system: 'system',
      user: 'user',
      assistant: 'assistant',
      tool: 'tool',
      memory: 'memory',
      summary: 'summary',
      other: 'other',
    },
    Prisma: { JsonNull: null, AnyNull, DbNull },
  };
});
// Mock PrismaService to avoid loading @prisma/client in unit tests
vi.mock('../src/core/services/prisma.service', () => {
  class PrismaServiceMock {
    getClient() {
      return { thread: { findUnique: async () => ({ channel: null }) } };
    }
  }
  return { PrismaService: PrismaServiceMock };
});
// Type augmentation for mocked helper
declare module '@slack/socket-mode' {
  export function __getLastSocketClient(): { handlers: { message?: Array<(env: SlackEnvelope) => Promise<void> | void> } } | null;
}
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { __getLastSocketClient } from '@slack/socket-mode';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
// Avoid importing AgentsPersistenceService to prevent @prisma/client load in unit tests
// We pass a stub object where needed.

import type { BufferMessage } from '../src/nodes/agent/messagesBuffer';

describe('SlackTrigger events', () => {
  const makeLogger = (): Pick<LoggerService, 'info' | 'debug' | 'error'> => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  });

  const setupTrigger = async () => {
    const logger = makeLogger();
    const getOrCreateThreadByAlias = vi.fn(async () => 't-slack');
    const updateThreadChannelDescriptor = vi.fn(async () => undefined);
    const persistence = ({
      getOrCreateThreadByAlias,
      updateThreadChannelDescriptor,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trig = new SlackTrigger(logger as LoggerService, persistence, prismaStub, slackAdapterStub);
    const nodeId = 'slack-node';
    trig.init({ nodeId });
    await trig.setConfig({ app_token: 'xapp-abc', bot_token: 'xoxb-bot' });
    const received: BufferMessage[] = [];
    const listener = { invoke: vi.fn(async (_t: string, msgs: BufferMessage[]) => { received.push(...msgs); }) };
    await trig.subscribe(listener);
    await trig.provision();
    const client = __getLastSocketClient();
    if (!client || !(client.handlers.message || []).length) throw new Error('Mock SocketMode client not initialized');
    const handler = (client.handlers.message || [])[0]!;
    return {
      handler,
      received,
      listenerInvoke: listener.invoke,
      getOrCreateThreadByAlias,
      updateThreadChannelDescriptor,
      trig,
      nodeId,
    };
  };

  it('persists descriptor for top-level events with root thread ts set to event ts', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, nodeId } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e1',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'U',
          channel: 'C',
          text: 'hello',
          ts: '1.0',
          channel_type: 'channel',
          client_msg_id: 'client-1',
          event_ts: 'evt-1',
        },
      },
    };
    await handler(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'U_1.0', 'hello', {
      channelNodeId: nodeId,
    });
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith(
      't-slack',
      expect.objectContaining({
        identifiers: { channel: 'C', thread_ts: '1.0' },
        meta: expect.objectContaining({ channel_type: 'channel', client_msg_id: 'client-1', event_ts: 'evt-1' }),
      }),
    );
  });

  it('does not overwrite descriptor for reply events', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, nodeId } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'reply',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'UR',
          channel: 'CR',
          text: 'reply content',
          ts: '5.0',
          thread_ts: 'root-5',
        },
      },
    };
    await handler(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'UR_root-5', 'reply content', {
      channelNodeId: nodeId,
    });
    expect(updateThreadChannelDescriptor).not.toHaveBeenCalled();
  });

  it('relays message events from socket-mode events_api payload', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, nodeId } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e2',
      ack,
      body: {
        type: 'events_api',
        payload: {
          event: {
            type: 'message',
            user: 'U2',
            channel: 'C2',
            text: 'hello socket',
            ts: '2.0',
          },
        },
      },
    };
    await handler(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'U2_2.0', 'hello socket', {
      channelNodeId: nodeId,
    });
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith(
      't-slack',
      expect.objectContaining({ identifiers: { channel: 'C2', thread_ts: '2.0' } }),
    );
  });

  it('falls back to envelope.event when body payload missing', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, nodeId } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e3',
      ack,
      event: {
        type: 'message',
        user: 'UF',
        channel: 'CF',
        text: 'fallback',
        ts: '3.0',
      },
    };
    await handler(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'UF_3.0', 'fallback', {
      channelNodeId: nodeId,
    });
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith(
      't-slack',
      expect.objectContaining({ identifiers: { channel: 'CF', thread_ts: '3.0' } }),
    );
  });

  it('acks and filters out non-message or subtype events without notifying listeners', async () => {
    const { handler, received, listenerInvoke, updateThreadChannelDescriptor, getOrCreateThreadByAlias } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e4',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'UX',
          channel: 'CX',
          text: 'should not dispatch',
          ts: '4.0',
          subtype: 'bot_message',
        },
      },
    };
    await handler(env);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(received.length).toBe(0);
    expect(listenerInvoke).not.toHaveBeenCalled();
    expect(getOrCreateThreadByAlias).not.toHaveBeenCalled();
    expect(updateThreadChannelDescriptor).not.toHaveBeenCalled();
  });

  it('setConfig rejects unresolved tokens', async () => {
    const logger = makeLogger();
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack' } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trig = new SlackTrigger(logger as LoggerService, persistence, prismaStub, slackAdapterStub);
    const badConfig = {
      app_token: { kind: 'vault', path: 'secret/slack', key: 'APP' },
      bot_token: 'xoxb-good',
    } as unknown as { app_token: string; bot_token: string };
    await expect(trig.setConfig(badConfig)).rejects.toThrow(/requires resolved tokens/);
  });

  it('fails provisioning when bot token prefix invalid', async () => {
    const logger = makeLogger();
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack' } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trig = new SlackTrigger(logger as LoggerService, persistence, prismaStub, slackAdapterStub);
    await trig.setConfig({ app_token: 'xapp-valid', bot_token: 'bot-invalid' });
    await trig.provision();
    expect(trig.status).toBe('provisioning_error');
  });
});
