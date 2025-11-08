import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import { parseVaultRef } from '../../utils/refs';
import type { ChannelAdapter, ChannelAdapterDeps, SendResult, ChannelDescriptor } from '../types';
import { SlackIdentifiersSchema } from '../types';

export class SlackAdapter implements ChannelAdapter {
  constructor(private deps: ChannelAdapterDeps) {}

  private async resolveBotTokenFromDescriptor(desc: ChannelDescriptor): Promise<string> {
    const bot = desc.auth.botToken;
    if (typeof bot === 'string') {
      if (!bot.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
      return bot;
    }
    const source = bot.source || 'static';
    if (source === 'vault') {
      const vr = parseVaultRef(bot.value);
      const secret = await this.deps.vault.getSecret(vr);
      if (!secret) throw new Error('Vault secret for bot_token not found');
      if (!secret.startsWith('xoxb-')) throw new Error('Resolved Slack bot token is invalid (must start with xoxb-)');
      return secret;
    }
    if (!bot.value.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
    return bot.value;
  }

  async sendText(input: { threadId: string; text: string; descriptor: ChannelDescriptor }): Promise<SendResult> {
    const { descriptor, threadId, text } = input;
    const parsedIds = SlackIdentifiersSchema.safeParse(descriptor.identifiers);
    if (!parsedIds.success) throw new Error('Slack descriptor identifiers invalid');
    const ids = parsedIds.data;
    const channel = ids.channelId;
    const replyTs = ids.threadTs ?? undefined;

    this.deps.logger.info('SlackAdapter.sendText', {
      type: descriptor.type,
      threadId,
      channelId: channel,
      replyTs,
    });

    const token = await this.resolveBotTokenFromDescriptor(descriptor);
    const client = new WebClient(token, { logLevel: undefined });
    try {
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
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
      let msg = 'unknown_error';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      return { ok: false, error: msg };
    }
  }
}
