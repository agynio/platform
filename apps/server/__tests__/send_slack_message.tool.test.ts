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

  it('sends message using provided bot_token and channel', async () => {
    const tool = new SendSlackMessageTool(logger);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hi', channel: 'C2' } as any);
    expect(String(res)).toContain('ok');
  });

  it('sends ephemeral when ephemeral_user set', async () => {
    const tool = new SendSlackMessageTool(logger);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'C1' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hi', channel: 'C1', ephemeral_user: 'U1' } as any);
    expect(String(res)).toContain('ephemeral');
  });

  it('uses default_channel when channel omitted', async () => {
    const tool = new SendSlackMessageTool(logger);
    await tool.setConfig({ bot_token: 'xoxb-valid', default_channel: 'CDEF' });
    const t = tool.init();
    const res = await t.invoke({ text: 'hello' } as any);
    expect(String(res)).toContain('ok');
  });
});
