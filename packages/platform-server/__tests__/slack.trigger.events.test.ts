import { describe, it, expect, vi } from 'vitest';
import type { LoggerService } from '../src/core/services/logger.service';
// BaseTrigger legacy removed in Issue #451; use SlackTrigger semantics only
// Typed helper for Slack socket-mode envelope used by our handler
type SlackMessageEvent = { type: 'message'; user: string; channel: string; text: string; ts: string };
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
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));
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
import { SlackTrigger } from '../src/graph/nodes/slackTrigger/slackTrigger.node';
import { __getLastSocketClient } from '@slack/socket-mode';
// Avoid importing AgentsPersistenceService to prevent @prisma/client load in unit tests
// We pass a stub object where needed.

import type { BufferMessage } from '../src/graph/nodes/agent/messagesBuffer';

describe('SlackTrigger events', () => {
  const makeLogger = (): Pick<LoggerService, 'info' | 'debug' | 'error'> => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  });

  it('relays message events from socket-mode client', async () => {
    const logger = makeLogger();
    const vault = ({ getSecret: async (ref: { value: string }) => (String(ref.value).includes('APP') ? 'xapp-abc' : 'xoxb-bot') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack', updateThreadChannelDescriptor: async () => undefined } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const trig = new SlackTrigger(logger as LoggerService, vault, persistence, prismaStub);
    await trig.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-bot', source: 'static' } });
    // Subscribe a listener
    const received: BufferMessage[] = [];
    await trig.subscribe({ invoke: async (_t, msgs) => { received.push(...msgs); } });
    await trig.provision();
    // Fire a mock socket-mode 'message' envelope.
    const client = __getLastSocketClient();
    if (!client) throw new Error('Mock SocketMode client not initialized');
    const h = (client.handlers.message || [])[0]!;
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e1',
      ack,
      body: {
        type: 'event_callback',
        event: { type: 'message', user: 'U', channel: 'C', text: 'hello', ts: '1.0' },
      },
    };
    await h(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('relays message events from socket-mode events_api payload', async () => {
    const logger = makeLogger();
    const vault = ({ getSecret: async (ref: { value: string }) => (String(ref.value).includes('APP') ? 'xapp-abc' : 'xoxb-bot') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack', updateThreadChannelDescriptor: async () => undefined } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias' | 'updateThreadChannelDescriptor'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const trig = new SlackTrigger(logger as LoggerService, vault, persistence, prismaStub);
    await trig.setConfig({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-bot', source: 'static' } });
    const received: BufferMessage[] = [];
    await trig.subscribe({ invoke: async (_t, msgs) => { received.push(...msgs); } });
    await trig.provision();
    const client = __getLastSocketClient();
    if (!client) throw new Error('Mock SocketMode client not initialized');
    const h = (client.handlers.message || [])[0]!;
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e2',
      ack,
      body: {
        type: 'events_api',
        payload: { event: { type: 'message', user: 'U2', channel: 'C2', text: 'hello socket', ts: '2.0' } },
      },
    };
    await h(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('sets status to provisioning_error when vault ref but vault disabled', async () => {
    const logger = makeLogger();
    const vault = ({ getSecret: vi.fn(async () => { throw new Error('vault disabled'); }) } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack' } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const trig = new SlackTrigger(logger as LoggerService, vault, persistence, prismaStub);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' }, bot_token: { value: 'secret/slack/BOT', source: 'vault' } });
    await trig.provision();
    expect(trig.status).toBe('provisioning_error');
  });

  it('resolves app token via vault during provision', async () => {
    const logger = makeLogger();
    const vault = ({ isEnabled: () => true, getSecret: vi.fn(async () => 'xapp-from-vault') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'isEnabled' | 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack' } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const trig = new SlackTrigger(logger as LoggerService, vault, persistence, prismaStub);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' }, bot_token: { value: 'xoxb-bot', source: 'static' } });
    await trig.provision();
    // Ensure a client was created by the trigger
    expect(__getLastSocketClient()).toBeTruthy();
  });

  it('fails when resolved app token has wrong prefix', async () => {
    const logger = makeLogger();
    const vault = ({ isEnabled: () => true, getSecret: vi.fn(async () => 'xoxb-wrong') } satisfies Pick<import('../src/vault/vault.service').VaultService, 'isEnabled' | 'getSecret'>) as import('../src/vault/vault.service').VaultService;
    const persistence = ({ getOrCreateThreadByAlias: async () => 't-slack' } satisfies Pick<import('../src/agents/agents.persistence.service').AgentsPersistenceService, 'getOrCreateThreadByAlias'>) as import('../src/agents/agents.persistence.service').AgentsPersistenceService;
    const prismaStub = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<import('../src/core/services/prisma.service').PrismaService, 'getClient'>) as import('../src/core/services/prisma.service').PrismaService;
    const trig = new SlackTrigger(logger as LoggerService, vault, persistence, prismaStub);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' }, bot_token: { value: 'xoxb-bot', source: 'static' } });
    await trig.provision();
    expect(trig.status).toBe('provisioning_error');
  });
});
