import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@agyn/llm';
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
import { ResolveError } from '../src/utils/references';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';
// Avoid importing AgentsPersistenceService to prevent @prisma/client load in unit tests
// We pass a stub object where needed.

import type { BufferMessage } from '../src/nodes/agent/messagesBuffer';

describe('SlackTrigger events', () => {
  const setupTrigger = async (options: { nodeTemplate?: string; templateMeta?: { kind: 'agent' | 'tool'; title: string } } = {}) => {
    const getOrCreateThreadByAlias = vi.fn(async () => 't-slack');
    const updateThreadChannelDescriptor = vi.fn(async () => undefined);
    const ensureAssignedAgent = vi.fn(async () => {});
    const persistence = ({
      getOrCreateThreadByAlias,
      updateThreadChannelDescriptor,
      ensureAssignedAgent,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const nodeTemplate = options.nodeTemplate ?? 'agent';
    const runtimeStub = ({
      getOutboundNodeIds: () => ['agent-rt-1'],
      getNodes: () => [{ id: 'agent-rt-1', template: nodeTemplate }],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({
      getMeta: (template: string) => {
        if (template === nodeTemplate) return options.templateMeta ?? { kind: 'agent', title: 'Agent' };
        return undefined;
      },
    } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const { stub: referenceResolver } = createReferenceResolverStub();
    const trig = new SlackTrigger(referenceResolver, persistence, prismaStub, slackAdapterStub, runtimeStub, templateRegistryStub);
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
      ensureAssignedAgent,
      trig,
      nodeId,
    };
  };

  it('persists descriptor for top-level events with root thread ts set to event ts', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, ensureAssignedAgent, nodeId } = await setupTrigger();
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
    expect(received[0]).toBeInstanceOf(HumanMessage);
    expect((received[0] as HumanMessage).text).toBe('From User:\nhello');
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'U_1.0', 'hello', {
      channelNodeId: nodeId,
    });
    expect(ensureAssignedAgent).toHaveBeenCalledWith('t-slack', 'agent-rt-1');
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith(
      't-slack',
      expect.objectContaining({
        identifiers: { channel: 'C', thread_ts: '1.0' },
        meta: expect.objectContaining({ channel_type: 'channel', client_msg_id: 'client-1', event_ts: 'evt-1' }),
      }),
    );
  });

  it('does not overwrite descriptor for reply events', async () => {
    const { handler, received, getOrCreateThreadByAlias, updateThreadChannelDescriptor, ensureAssignedAgent, nodeId } = await setupTrigger();
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
    expect(ensureAssignedAgent).toHaveBeenCalledWith('t-slack', 'agent-rt-1');
  });

  it('assigns agent using template metadata when template name differs', async () => {
    const { handler, ensureAssignedAgent } = await setupTrigger({ nodeTemplate: 'custom.agent', templateMeta: { kind: 'agent', title: 'Custom Agent' } });
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'meta',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'U',
          channel: 'C',
          text: 'hello',
          ts: 'meta-1',
        },
      },
    };
    await handler(env);
    expect(ensureAssignedAgent).toHaveBeenCalledWith('t-slack', 'agent-rt-1');
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
    expect(received[0]).toBeInstanceOf(HumanMessage);
    expect((received[0] as HumanMessage).text).toBe('From User:\nhello socket');
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
    expect(received[0]).toBeInstanceOf(HumanMessage);
    expect((received[0] as HumanMessage).text).toBe('From User:\nfallback');
    expect(ack).toHaveBeenCalledTimes(1);
    expect(getOrCreateThreadByAlias).toHaveBeenCalledWith('slack', 'UF_3.0', 'fallback', {
      channelNodeId: nodeId,
    });
    expect(updateThreadChannelDescriptor).toHaveBeenCalledWith(
      't-slack',
      expect.objectContaining({ identifiers: { channel: 'CF', thread_ts: '3.0' } }),
    );
  });

  it('preserves multiline slack content in human message text', async () => {
    const { handler, received } = await setupTrigger();
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const text = 'first line\nsecond line';
    const env: SlackEnvelope = {
      envelope_id: 'multiline',
      ack,
      body: {
        type: 'event_callback',
        event: {
          type: 'message',
          user: 'UM',
          channel: 'CM',
          text,
          ts: '9.0',
        },
      },
    };
    await handler(env);
    expect(received.length).toBe(1);
    expect((received[0] as HumanMessage).text).toBe(`From User:\n${text}`);
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

  it('setConfig rejects tokens the resolver leaves unresolved', async () => {
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't-slack',
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const { stub: referenceResolver } = createReferenceResolverStub();
    const trig = new SlackTrigger(referenceResolver, persistence, prismaStub, slackAdapterStub, runtimeStub, templateRegistryStub);
    const badConfig = {
      app_token: { kind: 'vault', path: 'secret/slack', key: 'APP' },
      bot_token: 'xoxb-good',
    } as any;
    await expect(trig.setConfig(badConfig)).rejects.toThrow(/Slack app_token is required/);
  });

  it('fails provisioning when bot token prefix invalid', async () => {
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't-slack',
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const { stub: referenceResolver } = createReferenceResolverStub();
    const trig = new SlackTrigger(referenceResolver, persistence, prismaStub, slackAdapterStub, runtimeStub, templateRegistryStub);
    await expect(trig.setConfig({ app_token: 'xapp-valid', bot_token: 'bot-invalid' })).rejects.toThrow(
      /Slack bot token must start with xoxb-/,
    );
  });

  it('resolves tokens via reference resolver', async () => {
    const resolver = {
      resolve: vi.fn(async () => ({
        output: { app_token: 'xapp-from-resolver', bot_token: 'xoxb-from-resolver' },
        report: { events: [], counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 } },
      })),
    } as any;
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't-slack',
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const trig = new SlackTrigger(resolver, persistence, prismaStub, slackAdapterStub, runtimeStub, templateRegistryStub);
    await trig.setConfig({
      app_token: { kind: 'vault', path: 'secret/slack', key: 'APP' } as any,
      bot_token: { kind: 'var', name: 'SLACK_BOT', default: 'xoxb-from-resolver' } as any,
    });
    await trig.provision();
    expect(resolver.resolve).toHaveBeenCalled();
    expect(trig.status).toBe('ready');
  });

  it('surface resolver errors during setConfig', async () => {
    const resolver = {
      resolve: vi.fn(async () => {
        throw new ResolveError('provider_missing', 'vault unavailable', {
          path: '/slack/app_token',
          source: 'secret',
        });
      }),
    } as any;
    const persistence = ({
      getOrCreateThreadByAlias: async () => 't-slack',
      ensureAssignedAgent: async () => undefined,
    } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'ensureAssignedAgent'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const slackAdapterStub = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const runtimeStub = ({
      getOutboundNodeIds: () => [],
      getNodes: () => [],
    } satisfies Pick<import('../src/graph-core/liveGraph.manager').LiveGraphRuntime, 'getOutboundNodeIds' | 'getNodes'>) as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const templateRegistryStub = ({ getMeta: () => undefined } satisfies Pick<import('../src/graph-core/templateRegistry').TemplateRegistry, 'getMeta'>) as import('../src/graph-core/templateRegistry').TemplateRegistry;
    const trig = new SlackTrigger(resolver, persistence, prismaStub, slackAdapterStub, runtimeStub, templateRegistryStub);
    await expect(
      trig.setConfig({
        app_token: { kind: 'vault', path: 'secret/slack', key: 'APP' } as any,
        bot_token: 'xoxb-good',
      }),
    ).rejects.toThrow(/Slack token resolution failed/);
  });
});
