import { describe, it, expect, vi } from 'vitest';
import { SendSlackMessageFunctionTool } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.tool';
import { SendSlackMessageNode } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.node';
import type { LoggerService } from '../src/core/services/logger.service';
import type { VaultService } from '../src/vault/vault.service';

// Mock @slack/web-api WebClient
vi.mock('@slack/web-api', () => {
  class MockWebClient {
    chat = {
      postMessage: vi.fn(async (_args: any) => ({ ok: true, channel: 'C1', ts: '1.23' })),
      postEphemeral: vi.fn(async (_args: any) => ({ ok: true, message_ts: '2.34' })),
    };
    constructor(_token: string) {}
  }
  return { WebClient: MockWebClient };
});

describe('SendSlackMessageFunctionTool', () => {
  const logger: Pick<LoggerService, 'info' | 'error' | 'debug'> = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };

  it('sends message using provided bot_token and channel (literal)', async () => {
    const node = new SendSlackMessageNode(logger as LoggerService, undefined as any);
    await node.setConfig({ bot_token: 'xoxb-valid' } as any);
    const tool = node.getTool();
    const payload = { text: 'hi', channel: 'C2' };
    const res = await tool.execute(payload as any);
    expect(String(res)).toContain('ok');
  });

  it('sends ephemeral when ephemeral_user set', async () => {
    const node = new SendSlackMessageNode(logger as LoggerService, undefined as any);
    await node.setConfig({ bot_token: 'xoxb-valid' } as any);
    const tool = node.getTool();
    const payload = { text: 'hi', channel: 'C1', ephemeral_user: 'U1' };
    const res = await tool.execute(payload as any);
    expect(String(res)).toContain('ephemeral');
  });

  it.skip('uses default_channel when channel omitted', async () => {
    // Legacy default_channel removed; pending design decision
  });

  it('returns error when vault disabled and vault ref provided', async () => {
    const node = new SendSlackMessageNode(logger as LoggerService, { getSecret: vi.fn(async () => { throw new Error('disabled'); }) } as any);
    await node.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } } as any);
    const tool = node.getTool();
    const res = await tool.execute({ text: 'hi', channel: 'C1' } as any);
    expect(String(res)).toContain('ok');
    expect(String(res)).toContain('false');
  });

  it('resolves bot token via vault and sends', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => 'xoxb-from-vault') };
    const node = new SendSlackMessageNode(logger as LoggerService, vault as VaultService);
    await node.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } } as any);
    const tool = node.getTool();
    const payload = { text: 'hi', channel: 'C1' };
    const res = await tool.execute(payload as any);
    expect(String(res)).toContain('ok');
    expect(vault.getSecret).toHaveBeenCalled();
  });

  it('returns error when vault secret missing', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => undefined) };
    const node = new SendSlackMessageNode(logger as LoggerService, vault as VaultService);
    await node.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } } as any);
    const tool = node.getTool();
    const payload = { text: 'hi', channel: 'C1' };
    const res = await tool.execute(payload as any);
    expect(String(res)).toContain('ok');
    expect(String(res)).toContain('false');
  });

  it('throws on invalid reference string during execution', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn() };
    const node = new SendSlackMessageNode(logger as LoggerService, vault as VaultService);
    await node.setConfig({ bot_token: { value: 'invalid', source: 'vault' } } as any);
    const tool = node.getTool();
    await expect(tool.execute({ text: 'hi', channel: 'C1' } as any)).rejects.toThrow();
  });

  it('errors when resolved bot token has wrong prefix', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => 'xapp-wrong') };
    const node = new SendSlackMessageNode(logger as LoggerService, vault as VaultService);
    await node.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } } as any);
    const tool = node.getTool();
    const payload = { text: 'hi', channel: 'C1' };
    const res = await tool.execute(payload as any);
    expect(String(res)).toContain('ok');
    expect(String(res)).toContain('false');
  });
});
