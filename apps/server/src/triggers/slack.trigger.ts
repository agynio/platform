import { BaseTrigger, TriggerHumanMessage } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { z } from 'zod';
import { SocketModeClient } from '@slack/socket-mode';
import { VaultService } from '../services/vault.service';
import { parseVaultRef, ReferenceFieldSchema } from '../utils/refs';

// Internal schema: accept either plain string or ReferenceField
export const SlackTriggerStaticConfigSchema = z
  .object({
    app_token: z.union([
      z
        .string()
        .min(1)
        .startsWith('xapp-', { message: 'Slack app-level token must start with xapp-' })
        .describe('Slack App-level token (xapp-...) for Socket Mode.'),
      ReferenceFieldSchema,
    ]),
  })
  .strict();

// Exposed UI schema: always show as ReferenceField with help
export const SlackTriggerExposedStaticConfigSchema = z
  .object({
    app_token: ReferenceFieldSchema.meta({
      'ui:field': 'ReferenceField',
      'ui:help': 'Use "vault" to reference a secret as mount/path/key.',
    }),
  })
  .strict();

/**
 * SlackTrigger
 * Starts a Socket Mode connection to Slack and relays inbound user messages
 * (non-bot, non-thread broadcast) to subscribers via notify().
 */
type TokenRef = { value: string; source: 'static' | 'vault' };

export class SlackTrigger extends BaseTrigger {
  private logger: LoggerService;
  private cfg: { app_token: TokenRef } | null = null;
  private client: SocketModeClient | null = null;
  private vault?: VaultService;

  constructor(logger: LoggerService, vault?: VaultService) {
    super();
    this.logger = logger;
    this.vault = vault;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = SlackTriggerStaticConfigSchema.parse(cfg || {});
    // Normalize to { value, source }
    let appToken: TokenRef;
    if (typeof parsed.app_token === 'string') {
      appToken = { value: parsed.app_token, source: 'static' };
    } else {
      const ref = parsed.app_token;
      const source = ref.source || 'static';
      if (source === 'vault') {
        if (!this.vault || !this.vault.isEnabled()) {
          throw new Error('Vault is disabled but a vault reference was provided for app_token');
        }
        // Validate ref format early
        parseVaultRef(ref.value);
      } else {
        if (!ref.value?.startsWith('xapp-')) {
          throw new Error('Slack app-level token must start with xapp-');
        }
      }
      appToken = { value: ref.value, source };
    }
    this.cfg = { app_token: appToken };
  }

  private async resolveAppToken(): Promise<string> {
    const cfg = this.cfg;
    if (!cfg) throw new Error('SlackTrigger not configured: app_token is required');
    const t = cfg.app_token;
    if (t.source === 'vault') {
      const vlt = this.vault;
      if (!vlt || !vlt.isEnabled()) throw new Error('Vault is disabled but a vault reference was provided for app_token');
      const vr = parseVaultRef(t.value);
      const secret = await vlt.getSecret(vr);
      if (!secret) throw new Error('Vault secret for app_token not found');
      if (!secret.startsWith('xapp-')) throw new Error('Resolved Slack app token is invalid (must start with xapp-)');
      return secret;
    }
    if (!t.value.startsWith('xapp-')) throw new Error('Slack app-level token must start with xapp-');
    return t.value;
  }

  private async ensureClient(): Promise<SocketModeClient> {
    if (this.client) return this.client;
    const appToken = await this.resolveAppToken();
    const client = new SocketModeClient({ appToken, logLevel: undefined });

    type SlackMessageEvent = {
      type: 'message';
      text?: string;
      user?: string;
      bot_id?: string;
      subtype?: string;
      channel?: string;
      channel_type?: string;
      ts?: string;
      thread_ts?: string;
    };
    type EventsApiEnvelope = { envelope_id: string; payload: unknown };

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

    const asMessageEvent = (p: unknown): SlackMessageEvent | null => {
      if (!isRecord(p)) return null;
      const ev = (p as Record<string, unknown>)['event'];
      if (!isRecord(ev)) return null;
      const typeVal = ev['type'];
      if (typeVal !== 'message') return null;
      const msg: SlackMessageEvent = {
        type: 'message',
        text: typeof ev['text'] === 'string' ? (ev['text'] as string) : undefined,
        user: typeof ev['user'] === 'string' ? (ev['user'] as string) : undefined,
        bot_id: typeof ev['bot_id'] === 'string' ? (ev['bot_id'] as string) : undefined,
        subtype: typeof ev['subtype'] === 'string' ? (ev['subtype'] as string) : undefined,
        channel: typeof ev['channel'] === 'string' ? (ev['channel'] as string) : undefined,
        channel_type: typeof ev['channel_type'] === 'string' ? (ev['channel_type'] as string) : undefined,
        ts: typeof ev['ts'] === 'string' ? (ev['ts'] as string) : undefined,
        thread_ts: typeof ev['thread_ts'] === 'string' ? (ev['thread_ts'] as string) : undefined,
      };
      // Filter bot/self and message subtypes (edits, joins, etc.)
      if (msg.bot_id) return null;
      if (typeof msg.subtype === 'string') return null;
      if (!msg.text) return null;
      return msg;
    };

    client.on('events_api', async ({ envelope_id, payload }: EventsApiEnvelope) => {
      try {
        await client.ack(envelope_id);
        const event = asMessageEvent(payload);
        if (!event) return;
        const thread = `${event.user}_${(event.thread_ts || event.ts)}`;
        const msg: TriggerHumanMessage = {
          kind: 'human',
          content: event.text,
          info: {
            user: event.user,
            channel: event.channel,
            channel_type: event.channel_type,
            thread_ts: event.thread_ts || event.ts,
          },
        };
        await this.notify(thread, [msg]);
      } catch (err) {
        this.logger.error('SlackTrigger handler error');
      }
    });
    this.client = client;
    return client;
  }

  protected async doProvision(): Promise<void> {
    const client = await this.ensureClient();
    this.logger.info('Starting SlackTrigger (socket mode)');
    await client.start();
    this.logger.info('SlackTrigger started');
  }
  protected async doDeprovision(): Promise<void> {
    try {
      await this.client?.disconnect();
    } catch {}
    this.client = null;
    this.logger.info('SlackTrigger stopped');
  }

  // Backward-compatible public API
  async start(): Promise<void> { await this.provision(); }
  async stop(): Promise<void> { await this.deprovision(); }

  async setDynamicConfig(_cfg: Record<string, unknown>): Promise<void> { /* no dynamic config */ }
}
