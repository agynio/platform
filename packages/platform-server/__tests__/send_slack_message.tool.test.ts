import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { SendSlackMessageNode } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.node';
import { SlackChannelAdapter } from '../src/channels/slack.adapter';

describe('legacy send_slack_message tool', () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  async function makeNode(deps: { persistence?: Partial<AgentsPersistenceService>; vault?: Partial<VaultService> }) {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: AgentsPersistenceService, useValue: deps.persistence || {} },
        { provide: VaultService, useValue: deps.vault || {} },
        {
          provide: SendSlackMessageNode,
          useFactory: (logger: LoggerService, vault: VaultService, persistence: AgentsPersistenceService) =>
            new SendSlackMessageNode(logger, vault, persistence),
          inject: [LoggerService, VaultService, AgentsPersistenceService],
        },
      ],
    }).compile();
    const node = await module.resolve(SendSlackMessageNode);
    return node;
  }

  it('uses node config bot_token and calls adapter for normal message', async () => {
    const persistence = {
      getThreadChannel: vi.fn(async () => ({ type: 'slack', channel: 'C123', thread_ts: '111', user: 'U1' })),
    } as Partial<AgentsPersistenceService> as AgentsPersistenceService;

    const sendSpy = vi
      .spyOn(SlackChannelAdapter.prototype, 'send')
      .mockResolvedValue({ ok: true, ref: { type: 'slack', channel: 'C123', ts: '222', thread_ts: '111' }, attempts: 1 });

    const node = await makeNode({ persistence });
    await node.setConfig({ bot_token: 'xoxb-abc' } as any);
    const tool = node.getTool();
    const res = await tool.execute({ text: 'hello', channel: 'C123', thread_ts: undefined as any, broadcast: false as any, ephemeral_user: null as any } as any, { threadId: 't-1' } as any);
    const parsed = JSON.parse(res);
    expect(parsed.ok).toBe(true);
    expect(parsed.channel).toBe('C123');
    expect(parsed.ts).toBe('222');
    expect(parsed.thread_ts).toBe('111');
    expect(parsed.broadcast).toBe(false);
    expect(parsed.ephemeral).toBe(false);
    expect(sendSpy).toHaveBeenCalledWith({ type: 'slack', channel: 'C123', thread_ts: '111', user: 'U1' }, { text: 'hello', broadcast: false, ephemeral_user: null }, 'xoxb-abc');
  });

  it('falls back to SLACK_BOT_TOKEN env when config missing', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-env-123';
    const persistence = {
      getThreadChannel: vi.fn(async () => ({ type: 'slack', channel: 'C1' })),
    } as Partial<AgentsPersistenceService> as AgentsPersistenceService;
    const sendSpy = vi
      .spyOn(SlackChannelAdapter.prototype, 'send')
      .mockResolvedValue({ ok: true, ref: { type: 'slack', channel: 'C1', ts: '1' }, attempts: 1 });
    const node = await makeNode({ persistence });
    await node.setConfig({} as any);
    const tool = node.getTool();
    const res = await tool.execute({ text: 'x', channel: 'C1', thread_ts: undefined as any, broadcast: false as any, ephemeral_user: null as any } as any, { threadId: 't' } as any);
    expect(JSON.parse(res).ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith({ type: 'slack', channel: 'C1', thread_ts: undefined, user: undefined }, { text: 'x', broadcast: false, ephemeral_user: null }, 'xoxb-env-123');
  });

  it('sets ephemeral: true when ephemeral_user provided and propagates mapped errors', async () => {
    const persistence = {
      getThreadChannel: vi.fn(async () => ({ type: 'slack', channel: 'C9' })),
    } as Partial<AgentsPersistenceService> as AgentsPersistenceService;
    vi
      .spyOn(SlackChannelAdapter.prototype, 'send')
      .mockResolvedValue({ ok: false, error: 'auth_error', attempts: 2 } as any);
    const node = await makeNode({ persistence });
    await node.setConfig({ bot_token: { value: 'xoxb-zzz', source: 'static' } } as any);
    const tool = node.getTool();
    const res = await tool.execute({ text: 'hi', channel: 'C9', thread_ts: undefined as any, broadcast: false as any, ephemeral_user: 'U9' } as any, { threadId: 't' } as any);
    const parsed = JSON.parse(res);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('auth_error');
    expect(parsed.ephemeral).toBe(true);
  });

  it('errors when token is missing', async () => {
    const persistence = {
      getThreadChannel: vi.fn(async () => ({ type: 'slack', channel: 'C1' })),
    } as Partial<AgentsPersistenceService> as AgentsPersistenceService;
    const node = await makeNode({ persistence });
    await node.setConfig({} as any);
    delete process.env.SLACK_BOT_TOKEN;
    const tool = node.getTool();
    const res = await tool.execute({ text: 'x', channel: 'C1', thread_ts: undefined as any, broadcast: false as any, ephemeral_user: null as any } as any, { threadId: 't' } as any);
    expect(JSON.parse(res)).toEqual({ ok: false, error: 'bot_token_missing' });
  });
});

