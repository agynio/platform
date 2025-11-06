import { Inject, Injectable, Scope } from '@nestjs/common';
import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { LoggerService } from '../core/services/logger.service';
import { ConfigService } from '../core/services/config.service';
import { VaultService } from '../vault/vault.service';
import { parseVaultRef } from '../utils/refs';
import type { SlackChannelInfo, SlackMessageRef } from './types';

export type SendResult = { ok: boolean; ref?: SlackMessageRef; error?: string; attempts: number };

@Injectable({ scope: Scope.TRANSIENT })
export class SlackChannelAdapter {
  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ConfigService) private readonly cfg: ConfigService,
    @Inject(VaultService) private readonly vault: VaultService,
  ) {}

  private async resolveBotToken(): Promise<string> {
    const token = this.cfg.slackBotToken;
    if (!token) throw new Error('SLACK_BOT_TOKEN not configured');
    const isVaultRef = token.startsWith('${vault:');
    if (isVaultRef) {
      const ref = parseVaultRef(token);
      const val = await this.vault.getSecret(ref);
      if (!val) throw new Error('Vault secret for SLACK_BOT_TOKEN not found');
      return String(val);
    }
    return token;
  }

  async send(
    info: SlackChannelInfo,
    params: { text: string; broadcast?: boolean; ephemeral_user?: string | null },
    tokenOverride?: string,
  ): Promise<SendResult> {
    const token = tokenOverride ?? (await this.resolveBotToken());
    const client = new WebClient(token, { logLevel: undefined });
    const maxAttempts = 3;
    let attempt = 0;
    const { text, ephemeral_user, broadcast } = params;
    const channel = info.channel;
    const thread_ts = info.thread_ts;
    let lastError: string | undefined;

    const tryOnce = async (): Promise<SendResult> => {
      if (ephemeral_user) {
        const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({ channel, user: ephemeral_user, text, thread_ts });
        if (!resp.ok) return { ok: false, error: this.mapSlackError(resp.error), attempts: attempt };
        return { ok: true, ref: { type: 'slack', channel, ts: resp.message_ts, ephemeral: true }, attempts: attempt };
      }
      const resp: ChatPostMessageResponse = await client.chat.postMessage({ channel, text, attachments: [], ...(thread_ts ? { thread_ts, ...(broadcast ? { reply_broadcast: true } : {}) } : {}) });
      if (!resp.ok) return { ok: false, error: this.mapSlackError(resp.error), attempts: attempt };
      const thread = (resp.message && 'thread_ts' in resp.message ? (resp.message as { thread_ts?: string }).thread_ts : undefined) || thread_ts || resp.ts;
      return { ok: true, ref: { type: 'slack', channel: resp.channel!, ts: resp.ts, thread_ts: thread }, attempts: attempt };
    };

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const res = await tryOnce();
        if (res.ok) return res;
        lastError = res.error;
      } catch (err: unknown) {
        const { retryAfterMs, message } = this.parseError(err);
        lastError = this.mapSlackError(message);
        if (retryAfterMs && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, retryAfterMs));
          continue;
        }
      }
      const delay = 300 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
    this.logger.error('SlackChannelAdapter.send failed', { channel, attempts: attempt, error: lastError });
    return { ok: false, error: lastError || 'unknown_error', attempts: attempt };
  }

  private mapSlackError(err?: string): string {
    if (!err) return 'unknown_error';
    switch (err) {
      case 'channel_not_found':
      case 'not_in_channel':
      case 'is_archived':
        return err;
      case 'invalid_auth':
      case 'account_inactive':
      case 'token_revoked':
        return 'auth_error';
      case 'ratelimited':
        return 'rate_limited';
      default:
        return err;
    }
  }

  private parseError(err: unknown): { retryAfterMs?: number; message: string } {
    const anyErr = err as any;
    const message = (anyErr?.data?.error as string) || (anyErr?.message as string) || String(err);
    const retryAfterSec =
      typeof anyErr?.retryAfter === 'number'
        ? anyErr.retryAfter
        : typeof anyErr?.data?.retry_after === 'number'
        ? anyErr.data.retry_after
        : typeof anyErr?.headers?.['retry-after'] === 'string'
        ? Number(anyErr.headers['retry-after'])
        : undefined;
    const retryAfterMs = typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : undefined;
    return { retryAfterMs, message };
  }
}
