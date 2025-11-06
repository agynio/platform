import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';

vi.mock('@slack/web-api', () => {
  const chat = { postMessage: vi.fn(), postEphemeral: vi.fn() };
  class WebClient { chat = chat; constructor(_token: string, _opts?: any) {} }
  const __getChat = () => chat;
  return { WebClient, __getChat };
});

describe('SlackChannelAdapter', () => {
  const make = async () => {
    const { SlackChannelAdapter } = await import('../src/channels/slack.adapter');
    const logger = new LoggerService();
    const cfg = { slackBotToken: 'xoxb-test' } as any;
    const vault = { getSecret: async () => 'dummy' } as any;
    const adapter = new SlackChannelAdapter(logger, cfg, vault);
    return { adapter };
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    const { __getChat } = await import('@slack/web-api');
    const chat = (__getChat as any)();
    chat.postMessage.mockReset();
    chat.postEphemeral.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('honors reply_broadcast for thread replies', async () => {
    const { adapter } = await make();
    const { __getChat } = await import('@slack/web-api');
    const chat = (__getChat as any)();
    chat.postMessage.mockResolvedValue({ ok: true, channel: 'C', ts: '2', message: { thread_ts: '1' } });
    const p = adapter.send({ type: 'slack', channel: 'C', thread_ts: '1' }, { text: 'hello', broadcast: true }, 'xoxb-test');
    await vi.runAllTicks();
    const res = await p;
    expect(res.ok).toBe(true);
    expect(chat.postMessage).toHaveBeenCalled();
    const arg = chat.postMessage.mock.calls[0][0];
    expect(arg.reply_broadcast).toBe(true);
  });

  it('retries on 429 with retry_after', async () => {
    const { adapter } = await make();
    const { __getChat } = await import('@slack/web-api');
    const chat = (__getChat as any)();
    chat.postMessage.mockRejectedValueOnce({ status: 429, retryAfter: 1, data: { error: 'ratelimited' } });
    chat.postMessage.mockResolvedValueOnce({ ok: true, channel: 'C', ts: '2', message: { thread_ts: '1' } });
    const promise = adapter.send({ type: 'slack', channel: 'C', thread_ts: '1' }, { text: 'hello' }, 'xoxb-test');
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(chat.postMessage).toHaveBeenCalledTimes(2);
  });

  it('retries on generic 5xx', async () => {
    const { adapter } = await make();
    const { __getChat } = await import('@slack/web-api');
    const chat = (__getChat as any)();
    chat.postMessage.mockRejectedValueOnce({ status: 500, data: { error: 'server_error' } });
    chat.postMessage.mockResolvedValueOnce({ ok: true, channel: 'C', ts: '2' });
    const promise = adapter.send({ type: 'slack', channel: 'C' }, { text: 'hello' }, 'xoxb-test');
    await vi.advanceTimersByTimeAsync(300);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(chat.postMessage).toHaveBeenCalledTimes(2);
  });

  it('retries on network error', async () => {
    const { adapter } = await make();
    const { __getChat } = await import('@slack/web-api');
    const chat = (__getChat as any)();
    chat.postMessage.mockRejectedValueOnce(new Error('ECONNRESET'));
    chat.postMessage.mockResolvedValueOnce({ ok: true, channel: 'C', ts: '2' });
    const promise = adapter.send({ type: 'slack', channel: 'C' }, { text: 'hello' }, 'xoxb-test');
    await vi.advanceTimersByTimeAsync(300);
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(chat.postMessage).toHaveBeenCalledTimes(2);
  });
});

