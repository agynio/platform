import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { parseVaultRef } from '../../utils/refs';
import type { ChannelAdapter, ChannelAdapterDeps, SendMessageOptions, SendResult } from '../types';
import type { ChannelDescriptor } from '../types';
import { SlackIdentifiersSchema } from '../types';

export class SlackAdapter implements ChannelAdapter {
  constructor(private deps: ChannelAdapterDeps) {}

  private async resolveBotToken(): Promise<string> {
    const bot = this.deps.config.slack.botToken;
    if (typeof bot === 'string') {
      if (!bot.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
      return bot;
    }
    const ref = bot;
    const source = ref.source || 'static';
    if (source === 'vault') {
      const vr = parseVaultRef(ref.value);
      const secret = await this.deps.vault.getSecret(vr);
      if (!secret) throw new Error('Vault secret for bot_token not found');
      if (!secret.startsWith('xoxb-')) throw new Error('Resolved Slack bot token is invalid (must start with xoxb-)');
      return secret;
    }
    if (!ref.value.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
    return ref.value;
  }

  async sendText(input: { threadId: string; text: string; descriptor: ChannelDescriptor; options?: SendMessageOptions }): Promise<SendResult> {
    const { descriptor, threadId, text } = input;
    const opts: SendMessageOptions = input.options ?? {};
    const parsedIds = SlackIdentifiersSchema.safeParse(descriptor.identifiers);
    if (!parsedIds.success) throw new Error('Slack descriptor identifiers invalid');
    const ids = parsedIds.data;
    const channel = ids.channelId;
    const replyTs = opts.replyTo ?? ids.threadTs ?? undefined;
    const ephemeralUser = ids.ephemeralUser ?? null;

    this.deps.logger.info('SlackAdapter.sendText', {
      type: descriptor.type,
      threadId,
      channelId: channel,
      replyTs,
      correlationId: opts.correlationId,
    });

    const token = await this.resolveBotToken();
    const client = new WebClient(token, { logLevel: undefined });

    const doSend = async (): Promise<SendResult> => {
      try {
        if (ephemeralUser) {
          const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({
            channel,
            user: ephemeralUser,
            text,
            thread_ts: replyTs,
          });
          if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
          return { ok: true, channelMessageId: resp.message_ts ?? null, threadId: replyTs ?? null };
        }
        const resp: ChatPostMessageResponse = await client.chat.postMessage({
          channel,
          text,
          mrkdwn: !!opts.markdown,
          attachments: [],
          ...(replyTs ? { thread_ts: replyTs } : {}),
        });
        if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' };
        const ts: string | null = resp.ts ?? null;
        let thread_ts: string | undefined;
        if (resp.message && typeof resp.message === 'object') {
          const m = resp.message as Record<string, unknown>;
          if (typeof m.thread_ts === 'string') thread_ts = m.thread_ts;
        }
        const threadIdOut = thread_ts ?? replyTs ?? ts ?? null;
        return { ok: true, channelMessageId: ts, threadId: threadIdOut };
      } catch (e: unknown) {
        // Detect rate limit safely via narrow property checks
        let rateLimited = false;
        let retryAfterMs: number | null = null;
        if (typeof e === 'object' && e !== null) {
          const obj = e as Record<string, unknown>;
          const code = typeof obj.code === 'string' ? obj.code : undefined;
          const data = obj.data as unknown;
          const response = typeof data === 'object' && data !== null && 'response' in (data as Record<string, unknown>)
            ? (data as Record<string, unknown>).response
            : undefined;
          const respObj = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : undefined;
          const status = respObj && typeof respObj.status === 'number' ? (respObj.status as number) : undefined;
          const headers = respObj && typeof respObj.headers === 'object' && respObj.headers !== null ? (respObj.headers as Record<string, unknown>) : undefined;
          const retryRaw = headers
            ? (typeof headers['retry-after'] === 'string'
                ? (headers['retry-after'] as string)
                : typeof headers['Retry-After'] === 'string'
                ? (headers['Retry-After'] as string)
                : undefined)
            : undefined;
          if (code === 'slack_webapi_platform_error' && status === 429) {
            rateLimited = true;
            const raNum = retryRaw ? Number(retryRaw) : NaN;
            retryAfterMs = Number.isFinite(raNum) ? raNum * 1000 : null;
          }
        }
        if (rateLimited) return { ok: false, error: 'rate_limited', rateLimited: true, retryAfterMs };
        let msg = 'unknown_error';
        if (typeof e === 'object' && e !== null && 'message' in e) {
          const mVal = (e as { message?: unknown }).message;
          if (typeof mVal === 'string' && mVal) msg = mVal;
        }
        return { ok: false, error: msg };
      }
    };

    // Single retry when rate limited
    const first = await doSend();
    if (first.rateLimited && first.retryAfterMs && first.retryAfterMs > 0) {
      await new Promise((r) => setTimeout(r, first.retryAfterMs));
      const second = await doSend();
      if (!second.ok && second.error === 'rate_limited') return second; // still limited
      return second;
    }
    return first;
  }
}
