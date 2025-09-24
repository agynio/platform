import { BaseTrigger, BaseTriggerOptions } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { SlackService } from '../services/slack.service';

// (Previously had SlackTriggerOptions with filter; removed for simplified constructor.)

/**
 * SlackTrigger
 * Starts a Socket Mode connection to Slack and relays inbound user messages
 * (non-bot, non-thread broadcast) to subscribers via `notify([text])`.
 */
export class SlackTrigger extends BaseTrigger {
  constructor(
    private slack: SlackService,
    private logger: LoggerService,
    options?: BaseTriggerOptions,
  ) {
    super(options);
    this.slack.onMessage(async (event) => {
      try {
        if (!event.text) return;
        const thread = `${event.user}_${event.thread_ts ?? event.ts}`;
        await this.notify(thread, [
          {
            content: event.text,
            info: {
              user: event.user,
              channel: event.channel,
              channel_type: (event as any).channel_type,
              thread_ts: event.thread_ts ?? event.ts,
            },
          },
        ]);
      } catch (err) {
        this.logger.error('SlackTrigger handler error', err);
      }
    });
  }

  // Provision hooks delegate to SlackService
  protected async doProvision(): Promise<void> { await this.slack.start(); }
  protected async doDeprovision(): Promise<void> { await this.slack.stop(); }

  // Backward-compatible public API
  async start(): Promise<void> { await this.provision(); }
  async stop(): Promise<void> { await this.deprovision(); }

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    /* trigger has no dynamic config yet */
  }
}
