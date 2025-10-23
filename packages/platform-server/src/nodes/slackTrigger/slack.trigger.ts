import { BaseTrigger, TriggerHumanMessage } from './base.trigger';
import { LoggerService } from '../../core/services/logger.service';
import { z } from 'zod';
import { SocketModeClient } from '@slack/socket-mode';
import { VaultService } from '../../core/services/vault.service';
import { normalizeTokenRef, resolveTokenRef, ReferenceFieldSchema, parseVaultRef } from '../../utils/refs';

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
export class SlackTrigger extends BaseTrigger {
  private cfg: { app_token: { value: string; source: 'static' | 'vault' } } | null = null;
  private client: SocketModeClient | null = null;
  private vault?: VaultService;

  constructor(logger: LoggerService, vault?: VaultService) {
    super(logger);
    this.vault = vault;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = SlackTriggerStaticConfigSchema.parse(cfg || {});
    // Normalize to { value, source }
    const appToken = normalizeTokenRef(parsed.app_token as any);
    // Early validation: keep fail-fast semantics
    if ((appToken.source || 'static') === 'vault') {
      if (!this.vault || !this.vault.isEnabled()) {
        throw new Error('Vault is disabled but a vault reference was provided for app_token');
      }
      parseVaultRef(appToken.value);
    } else {
      if (!appToken.value?.startsWith('xapp-')) {
        throw new Error('Slack app-level token must start with xapp-');
      }
    }
    this.cfg = { app_token: { value: appToken.value, source: (appToken.source || 'static') as 'static' | 'vault' } };
    void this.start();
  }

  private async resolveAppToken(): Promise<string> {
    const cfg = this.cfg;
    if (!cfg) throw new Error('SlackTrigger not configured: app_token is required');
    const t = cfg.app_token;
    const resolved = await resolveTokenRef(t, { expectedPrefix: 'xapp-', fieldName: 'app_token', vault: this.vault });
    return resolved;
  }

  private async ensureClient(): Promise<SocketModeClient> {
    if (this.client) return this.client;
    const appToken = await this.resolveAppToken();
    const client = new SocketModeClient({ appToken, logLevel: undefined });

    // Shape observed from SocketModeClient for a message event envelope.
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
      client_msg_id?: string;
      event_ts?: string;
      [k: string]: unknown;
    };
    type SlackEventCallbackBody = {
      type: 'event_callback';
      event: SlackMessageEvent | { type: string; [k: string]: unknown };
      [k: string]: unknown;
    };
    type SlackMessageEnvelope = {
      ack: () => Promise<void>;
      envelope_id: string;
      body: SlackEventCallbackBody;
      event?: SlackMessageEvent; // library may copy body.event here
      retry_num?: number;
      retry_reason?: string;
      accepts_response_payload?: boolean;
      [k: string]: unknown;
    };

    const isMessageEvent = (ev: unknown): ev is SlackMessageEvent => {
      return typeof ev === 'object' && ev !== null && (ev as { type?: unknown }).type === 'message';
    };

    client.on('message', async (envelope: SlackMessageEnvelope) => {
      try {
        await envelope.ack();
        const rawEvent = (envelope.body && envelope.body.event) || envelope.event;
        if (!isMessageEvent(rawEvent)) return;
        const event = rawEvent;
        // Filter bot/self and message subtypes (edits, joins, etc.)
        if (event.bot_id) return;
        if (typeof event.subtype === 'string') return;
        const text = typeof event.text === 'string' ? event.text : '';
        if (!text.trim()) return;
        const threadIdPart = event.thread_ts || event.ts || 'unknown';
        const userPart = event.user || 'unknown';
        const thread = `${userPart}_${threadIdPart}`;
        const msg: TriggerHumanMessage = {
          kind: 'human',
          content: text,
          info: {
            user: event.user,
            channel: event.channel,
            channel_type: event.channel_type,
            thread_ts: event.thread_ts || event.ts,
            client_msg_id: event.client_msg_id,
            event_ts: event.event_ts,
          },
        };
        await this.notify(thread, [msg]);
      } catch (err) {
        this.logger.error('SlackTrigger handler error', err);
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
  async start(): Promise<void> {
    await this.provision();
  }
  async stop(): Promise<void> {
    await this.deprovision();
  }

  async setDynamicConfig(_cfg: Record<string, unknown>): Promise<void> {
    /* no dynamic config */
  }
}
