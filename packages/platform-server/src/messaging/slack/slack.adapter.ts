import { Injectable, Logger } from '@nestjs/common';
import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import type { SendResult } from '../types';

@Injectable()
export class SlackAdapter {
  private readonly logger = new Logger(SlackAdapter.name);

  async sendText(input: { token: string; channel: string; text: string; thread_ts?: string }): Promise<SendResult> {
    const { token, channel, text, thread_ts } = input;

    this.logger.log(`SlackAdapter.sendText ${JSON.stringify({ channel, threadTs: thread_ts ?? null })}`);

    const client = new WebClient(token, { logLevel: undefined });
    try {
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!resp.ok) return { ok: false, error: resp.error || 'unknown_error' } satisfies SendResult;
      const ts: string | undefined = typeof resp.ts === 'string' ? resp.ts : undefined;
      const threadIdOut = thread_ts ?? ts ?? null;
      return { ok: true, channelMessageId: ts ?? null, threadId: threadIdOut } satisfies SendResult;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return { ok: false, error: msg } satisfies SendResult;
    }
  }
}
