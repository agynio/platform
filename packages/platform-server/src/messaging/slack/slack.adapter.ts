import { Injectable } from '@nestjs/common';
import { WebClient, type ChatPostMessageResponse } from '@slack/web-api';
import type { SendResult } from '../types';
import { LoggerService } from '../../core/services/logger.service';

@Injectable()
export class SlackAdapter {
  constructor(private readonly logger: LoggerService) {}

  async sendText(input: { token: string; channel: string; text: string; thread_ts?: string }): Promise<SendResult> {
    const { token, channel, text, thread_ts } = input;

    this.logger.info('SlackAdapter.sendText', {
      channel,
      thread_ts,
    });

    const client = new WebClient(token, { logLevel: undefined });
    try {
      const respRaw: unknown = await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!respRaw || typeof respRaw !== 'object') {
        this.logger.error('SlackAdapter.sendText: invalid Slack response', {
          channel,
          thread_ts,
          responseType: respRaw === null ? 'null' : typeof respRaw,
        });
        return { ok: false, error: 'slack_api_invalid_response' };
      }

      const okValue = (respRaw as { ok?: unknown }).ok;
      if (typeof okValue !== 'boolean') {
        this.logger.error('SlackAdapter.sendText: response missing ok flag', {
          channel,
          thread_ts,
          responseKeys: Object.keys(respRaw as Record<string, unknown>).slice(0, 10),
        });
        return { ok: false, error: 'slack_api_invalid_response' };
      }

      const resp = respRaw as ChatPostMessageResponse;
      if (!resp.ok) {
        const error = typeof resp.error === 'string' && resp.error.trim() ? resp.error : 'unknown_error';
        return { ok: false, error };
      }

      const ts: string | undefined = typeof resp.ts === 'string' ? resp.ts : undefined;
      // Stakeholder constraint: derive thread id deterministically without duck typing.
      // Only use known typed fields: request thread_ts and response ts.
      const threadIdOut = thread_ts ?? ts ?? null;
      return { ok: true, channelMessageId: ts ?? null, threadId: threadIdOut };
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return { ok: false, error: msg };
    }
  }
}
