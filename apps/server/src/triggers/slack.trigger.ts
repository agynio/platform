import { BaseTrigger, TriggerHumanMessage } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { SlackService } from '../services/slack.service';
import { z } from 'zod';

// Event info schema matching emitted info payloads
export const SlackEventInfoSchema = z
  .object({
    source: z.literal('slack'),
    event_type: z.enum(['message', 'reaction_added', 'reaction_removed', 'slash_command']),
    team_id: z.string().optional(),
    channel: z.string(),
    channel_type: z.enum(['app_home', 'channel', 'group', 'im', 'mpim']).optional(),
    user: z.string().optional(),
    text: z.string().optional(),
    ts: z.string(),
    thread_ts: z.string().optional(),
    subtype: z.string().optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .strict();

// Static configuration schema with defaults
export const SlackTriggerStaticConfigSchema = z
  .object({
    channelsAllowlist: z.array(z.string()).default([]),
    usersAllowlist: z.array(z.string()).default([]),
    mentionsOnly: z.boolean().default(false),
    ignoreBots: z.boolean().default(true),
    dropSubtypes: z.array(z.string()).default(['bot_message', 'message_changed']),
    includeRawEvent: z.boolean().default(false),
    threadKeyStrategy: z
      .enum(['by_user_and_thread', 'by_channel_and_thread', 'by_channel_only', 'by_user_only'])
      .default('by_user_and_thread'),
  })
  .strict();

export type SlackTriggerStaticConfig = z.infer<typeof SlackTriggerStaticConfigSchema>;

/**
 * SlackTrigger
 * Starts a Socket Mode connection to Slack and relays inbound user messages
 * (non-bot, non-thread broadcast) to subscribers via notify().
 */
export class SlackTrigger extends BaseTrigger {
  private cfg: SlackTriggerStaticConfig = SlackTriggerStaticConfigSchema.parse({});

  constructor(
    private slack: SlackService,
    private logger: LoggerService,
  ) {
    super();
    // Subscribe to Slack message events; filtering is applied per config
    this.slack.onMessage(async (event) => {
      try {
        // Basic shape safeguard; Slack Bolt provides strings for ts/thread_ts
        const subtype = (event as any).subtype as string | undefined;
        const bot_id = (event as any).bot_id as string | undefined;
        const channel_type = (event as any).channel_type as string | undefined;

        // Filtering rules
        if (this.cfg.ignoreBots && (bot_id || subtype === 'bot_message')) return;
        if (this.cfg.dropSubtypes.includes(subtype || '')) return;
        if (this.cfg.channelsAllowlist.length && !this.cfg.channelsAllowlist.includes(event.channel)) return;
        if (this.cfg.usersAllowlist.length && !this.cfg.usersAllowlist.includes(event.user ?? '')) return;
        if (this.cfg.mentionsOnly) {
          // Allow DMs (im) even when mentionsOnly; channel mention enforcement deferred until bot id exposed
          if (channel_type && channel_type !== 'im') {
            // For now, drop non-DM when mentionsOnly; revisit when SlackService exposes bot user id
            return;
          }
        }

        if (!event.text) return; // drop empty textual events

        const info = SlackEventInfoSchema.parse({
          source: 'slack',
          event_type: 'message',
          team_id: (event as any).team,
          channel: event.channel,
          channel_type: channel_type as any,
          user: event.user,
          text: event.text,
          ts: String(event.ts),
          thread_ts: (event as any).thread_ts ? String((event as any).thread_ts) : undefined,
          subtype,
          raw: this.cfg.includeRawEvent ? (event as any) : undefined,
        });

        const threadKey = this.computeThreadKey(info);
        const msg: TriggerHumanMessage = { kind: 'human', content: info.text || '', info };
        await this.notify(threadKey, [msg]);
      } catch (err) {
        this.logger.error('SlackTrigger handler error', err);
      }
    });
  }

  private computeThreadKey(info: z.infer<typeof SlackEventInfoSchema>): string {
    const baseTs = info.thread_ts ?? info.ts;
    switch (this.cfg.threadKeyStrategy) {
      case 'by_user_and_thread':
        return `${info.user || 'unknown'}_${baseTs}`;
      case 'by_channel_and_thread':
        return `${info.channel}_${baseTs}`;
      case 'by_channel_only':
        return `${info.channel}`;
      case 'by_user_only':
        return `${info.user || 'unknown'}`;
      default:
        return `${info.user || 'unknown'}_${baseTs}`;
    }
  }

  // Provision hooks delegate to SlackService
  protected async doProvision(): Promise<void> { await this.slack.start(); }
  protected async doDeprovision(): Promise<void> { await this.slack.stop(); }

  // Backward-compatible public API
  async start(): Promise<void> { await this.provision(); }
  async stop(): Promise<void> { await this.deprovision(); }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    // Accept static config and apply defaults
    this.cfg = SlackTriggerStaticConfigSchema.parse(cfg ?? {});
  }
}
