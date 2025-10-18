import { describe, it, expect, vi } from 'vitest';
import { SendSlackMessageTool } from '../src/tools/send_slack_message.tool';
import type { LoggerService } from '../src/services/logger.service';
import type { VaultService } from '../src/services/vault.service';

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

describe('SendSlackMessageTool', () => {
  const logger: Pick<LoggerService, 'info' | 'error' | 'debug'> = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };

  it('sends message using provided bot_token and channel (literal)', async () => {
    const tool = new SendSlackMessageTool(logger, undefined);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hi', channel: 'C2' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('ok');
  });

  it('sends ephemeral when ephemeral_user set', async () => {
    const tool = new SendSlackMessageTool(logger, undefined);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hi', channel: 'C1', ephemeral_user: 'U1' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('ephemeral');
  });

  it('uses default_channel when channel omitted', async () => {
    const tool = new SendSlackMessageTool(logger, undefined);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'CDEF' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hello' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('ok');
  });

  it('fails fast on vault ref when vault disabled', async () => {
    const tool = new SendSlackMessageTool(logger, undefined);
    await expect(tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } })).rejects.toThrow();
  });

  it('resolves bot token via vault and sends', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => 'xoxb-from-vault') };
    const tool = new SendSlackMessageTool(logger as LoggerService, vault as VaultService);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hi' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('ok');
    expect(vault.getSecret).toHaveBeenCalled();
  });

  it('returns error when vault secret missing', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => undefined) };
    const tool = new SendSlackMessageTool(logger as LoggerService, vault as VaultService);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hi' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('Error sending Slack message');
  });

  it('throws on invalid reference string during setConfig', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn() };
    const tool = new SendSlackMessageTool(logger as LoggerService, vault as VaultService);
    await expect(tool.setConfig({ bot_token: { value: 'invalid', source: 'vault' } })).rejects.toThrow();
  });

  it('errors when resolved bot token has wrong prefix', async () => {
    const vault: Pick<VaultService, 'isEnabled' | 'getSecret'> = { isEnabled: () => true, getSecret: vi.fn(async () => 'xapp-wrong') };
    const tool = new SendSlackMessageTool(logger as LoggerService, vault as VaultService);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' });
    const t = tool.init();
    type InvokeInput = Parameters<ReturnType<SendSlackMessageTool['init']>['invoke']>[0];
    const payload: InvokeInput = { text: 'hi' };
    const res = await t.invoke(payload);
    expect(String(res)).toContain('Error sending Slack message');
  });
});
