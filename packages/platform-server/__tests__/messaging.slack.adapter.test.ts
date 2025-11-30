import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';

vi.mock('@slack/web-api', () => {
  type ChatPostMessageArguments = { channel: string; text: string; thread_ts?: string };
  type ChatPostMessageResponse = { ok: boolean; channel?: string; ts?: string; message?: { thread_ts?: string } };
  let last: { token: string } | null = null;
  class WebClient {
    constructor(token: string) {
      last = { token };
    }
    chat = {
      postMessage: async (opts: ChatPostMessageArguments): Promise<ChatPostMessageResponse> => ({ ok: true, channel: opts.channel, ts: '1729', message: { thread_ts: opts.thread_ts || '1729' } }),
    };
  }
  return { WebClient, __getLastWebClient: () => last };
});

describe('SlackAdapter', () => {
  const adapter = new SlackAdapter();
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('sends message successfully', async () => {
    const res = await adapter.sendText({ token: 'xoxb-abc', channel: 'C1', text: 'hello' });
    expect(res.ok).toBe(true);
    expect(res.channelMessageId).toBe('1729');
  });
});
