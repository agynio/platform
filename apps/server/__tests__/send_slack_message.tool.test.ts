import { describe, it, expect, vi } from 'vitest';
import { SendSlackMessageTool } from '../src/tools/send_slack_message.tool';

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
  const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

  it('sends message using provided bot_token and channel (literal)', async () => {
    const tool = new SendSlackMessageTool(logger, undefined as any);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hi', channel: 'C2' } as any);
    expect(String(res)).toContain('ok');
  });

  it('sends ephemeral when ephemeral_user set', async () => {
    const tool = new SendSlackMessageTool(logger, undefined as any);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hi', channel: 'C1', ephemeral_user: 'U1' } as any);
    expect(String(res)).toContain('ephemeral');
  });

  it('uses default_channel when channel omitted', async () => {
    const tool = new SendSlackMessageTool(logger, undefined as any);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'CDEF' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hello' } as any);
    expect(String(res)).toContain('ok');
  });

  it('fails fast on vault ref when vault disabled', async () => {
    const tool = new SendSlackMessageTool(logger, undefined as any);
    await expect(tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' } } as any)).rejects.toThrow();
  });

  it('resolves bot token via vault and sends', async () => {
    const vault = { isEnabled: () => true, getSecret: vi.fn(async () => 'xoxb-from-vault') } as any;
    const tool = new SendSlackMessageTool(logger, vault);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' } as any);
    const t = tool.init();
    const res = await t.invoke({ text: 'hi' } as any);
    expect(String(res)).toContain('ok');
    expect(vault.getSecret).toHaveBeenCalled();
  });

  it('returns error when vault secret missing', async () => {
    const vault = { isEnabled: () => true, getSecret: vi.fn(async () => undefined) } as any;
    const tool = new SendSlackMessageTool(logger, vault);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' } as any);
    const t = tool.init();
    const res = await t.invoke({ text: 'hi' } as any);
    expect(String(res)).toContain('Error sending Slack message');
  });

  it('throws on invalid reference string during setConfig', async () => {
    const vault = { isEnabled: () => true, getSecret: vi.fn() } as any;
    const tool = new SendSlackMessageTool(logger, vault);
    await expect(tool.setConfig({ bot_token: { value: 'invalid', source: 'vault' } } as any)).rejects.toThrow();
  });

  it('errors when resolved bot token has wrong prefix', async () => {
    const vault = { isEnabled: () => true, getSecret: vi.fn(async () => 'xapp-wrong') } as any;
    const tool = new SendSlackMessageTool(logger, vault);
    await tool.setConfig({ bot_token: { value: 'secret/slack/BOT', source: 'vault' }, default_channel: 'C1' } as any);
    const t = tool.init();
    const res = await t.invoke({ text: 'hi' } as any);
    expect(String(res)).toContain('Error sending Slack message');
  });
});
