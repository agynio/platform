import { BaseTrigger, TriggerHumanMessage } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { z } from 'zod';
import { SocketModeClient } from '@slack/socket-mode';

export const SlackTriggerStaticConfigSchema = z.object({
  app_token: z.string().min(1).startsWith('xapp-', { message: 'Slack app-level token must start with xapp-' }).describe('Slack App-level token (xapp-...) for Socket Mode.'),
}).strict();

/**
 * SlackTrigger
 * Starts a Socket Mode connection to Slack and relays inbound user messages
 * (non-bot, non-thread broadcast) to subscribers via notify().
 */
export class SlackTrigger extends BaseTrigger {
  private logger: LoggerService;
  private cfg: z.infer<typeof SlackTriggerStaticConfigSchema> | null = null;
  private client: SocketModeClient | null = null;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = SlackTriggerStaticConfigSchema.parse(cfg || {});
    this.cfg = parsed;
  }

  private ensureClient(): SocketModeClient {
    if (this.client) return this.client;
    const cfg = this.cfg;
    if (!cfg) throw new Error('SlackTrigger not configured: app_token is required');
    const client = new SocketModeClient({ appToken: cfg.app_token, logLevel: undefined });

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
    const client = this.ensureClient();
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
