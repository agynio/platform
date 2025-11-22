import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SendMessageNode } from '../src/nodes/tools/send_message/send_message.node';
import { EventsBusService } from '../src/events/events-bus.service';
import { RunEventsService } from '../src/events/run-events.service';
import { LoggerService } from '../src/core/services/logger.service';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { PrismaService } from '../src/core/services/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

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
      postMessage: vi.fn(
        async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({
          ok: true,
          channel: opts.channel,
          ts: '2001',
          message: { thread_ts: opts.thread_ts || '2001' },
        }),
      ),
    };
  }
  return { WebClient };
});

const createPrismaStub = (descriptor: unknown): Partial<PrismaService> => ({
  getClient: () => ({
    thread: {
      findUnique: async () => ({ channel: descriptor }),
    },
  }),
});

const createVaultStub = (): Partial<VaultService> => ({
  getSecret: vi.fn(),
});

const createPersistenceStub = (): Partial<AgentsPersistenceService> => ({
  getOrCreateThreadByAlias: vi.fn(async () => 't1'),
  updateThreadChannelDescriptor: vi.fn(),
});

describe('send_message tool (events bus)', () => {
  it('regression: legacy SlackTrigger DI without provision returns slacktrigger_unprovisioned', async () => {
    const descriptor = { type: 'slack', version: 1, identifiers: { channel: 'C1', thread_ts: 'T1' }, meta: {} };
    const eventsBusStub = ({ subscribeToSlackSendRequested: vi.fn(() => () => {}) } satisfies Partial<EventsBusService>);
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        SlackTrigger,
        { provide: VaultService, useValue: createVaultStub() },
        { provide: AgentsPersistenceService, useValue: createPersistenceStub() },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: EventsBusService, useValue: eventsBusStub },
        { provide: SlackAdapter, useValue: { sendText: vi.fn() } satisfies Partial<SlackAdapter> },
      ],
    }).compile();

    const trigger = await testingModule.resolve(SlackTrigger);
    // Legacy DI path: SlackTrigger resolved from container but never provisioned.
    const result = await trigger.sendToThread('legacy-thread', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('slacktrigger_unprovisioned');

    await testingModule.close();
  });

  it('deterministic: SendMessageFunctionTool emits slack send event handled by SlackTrigger', async () => {
    const descriptor = { type: 'slack', version: 1, identifiers: { channel: 'C1', thread_ts: 'T1' }, meta: {} };
    const sendText = vi.fn(async () => ({ ok: true, channelMessageId: 'mid', threadId: 'tid' }));
    const runEventsStub = { publishEvent: vi.fn() } satisfies Partial<RunEventsService>;
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        SendMessageNode,
        SlackTrigger,
        EventsBusService,
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: VaultService, useValue: createVaultStub() },
        { provide: AgentsPersistenceService, useValue: createPersistenceStub() },
        { provide: PrismaService, useValue: createPrismaStub(descriptor) },
        { provide: SlackAdapter, useValue: { sendText } satisfies Partial<SlackAdapter> },
      ],
    }).compile();

    const trigger = await testingModule.resolve(SlackTrigger);
    await trigger.setConfig({
      app_token: { value: 'xapp-token', source: 'static' },
      bot_token: { value: 'xoxb-token', source: 'static' },
    });
    await trigger.provision();

    const node = await testingModule.resolve(SendMessageNode);
    const tool = node.getTool();
    const response = await tool.execute({ message: 'hello world' }, { threadId: 't-thread' });
    expect(JSON.parse(response)).toEqual({ ok: true, status: 'queued' });

    await vi.waitFor(() => {
      expect(sendText).toHaveBeenCalledWith({
        token: 'xoxb-token',
        channel: 'C1',
        text: 'hello world',
        thread_ts: 'T1',
      });
    });

    await trigger.deprovision();
    await testingModule.close();
  });
});
