import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { parseVaultRef, resolveTokenRef, ReferenceFieldSchema } from '../../utils/refs';
import type { ChannelAdapter, ChannelAdapterDeps, SendMessageOptions, SendResult } from '../types';
import type { ChannelDescriptor } from '../types';
import { z } from 'zod';

const SlackConfigSchema = z.object({
  slack: z.object({ botToken: z.union([z.string().min(1), ReferenceFieldSchema]) }).strict(),
});

// _SlackConfig type retained for clarity if needed; prefixed to satisfy lint unused-var rule.
type _SlackConfig = z.infer<typeof SlackConfigSchema>;

export class SlackAdapter implements ChannelAdapter {
  constructor(private deps: ChannelAdapterDeps) {}

  private async resolveBotToken(): Promise<string> {
    const parsed = SlackConfigSchema.safeParse(this.deps.config);
    if (!parsed.success) throw new Error('Slack configuration missing (slack.botToken)');
    const bot = parsed.data.slack.botToken;
    const ref = typeof bot === 'string' ? { value: bot, source: 'static' as const } : bot;
    if ((ref.source || 'static') === 'vault') parseVaultRef(ref.value);
    const token = await resolveTokenRef(ref, {
      expectedPrefix: 'xoxb-',
      fieldName: 'bot_token',
      vault: this.deps.vault,
    });
    return token;
  }

  async sendText(input: { threadId: string; text: string; descriptor: ChannelDescriptor; options?: SendMessageOptions }): Promise<SendResult> {
    const { descriptor, threadId, text } = input;
    const opts = input.options || {};
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
        type SlackMsgThread = { thread_ts?: string };
        const thread_ts: string | undefined = resp.message && 'thread_ts' in (resp.message as SlackMsgThread)
          ? (resp.message as SlackMsgThread).thread_ts
          : undefined;
        const threadIdOut = thread_ts ?? replyTs ?? ts ?? null;
        return { ok: true, channelMessageId: ts, threadId: threadIdOut };
      } catch (e: unknown) {
        // Detect rate limit safely
        const err = e as unknown;
        type SlackError = { code?: string; data?: { response?: { status?: number; headers?: Record<string, string> } } };
        let rateLimited = false;
        let retryAfterMs: number | null = null;
        if (typeof err === 'object' && err !== null) {
          const se = err as SlackError;
          const code = se.code;
          const status = se.data?.response?.status;
          const headers = se.data?.response?.headers;
          const retryAfterHeader = headers?.['retry-after'] ?? headers?.['Retry-After'];
          if (code === 'slack_webapi_platform_error' && status === 429) {
            rateLimited = true;
            const ra = Number(retryAfterHeader);
            retryAfterMs = Number.isFinite(ra) ? ra * 1000 : null;
          }
        }
        if (rateLimited) return { ok: false, error: 'rate_limited', rateLimited: true, retryAfterMs };
        let msg = 'unknown_error';
        if (typeof err === 'object' && err !== null && 'message' in err) {
          const m = (err as { message?: string }).message;
          if (typeof m === 'string' && m) msg = m;
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
