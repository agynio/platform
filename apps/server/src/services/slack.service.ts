import Bolt from '@slack/bolt';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';

export interface SlackMessagePayload {
  channel: string;
  text: string;
  thread_ts?: string;
  broadcast?: boolean; // for thread replies
  ephemeral_user?: string; // if set -> ephemeral
}

const isMessageEvent = (event: Bolt.KnownEventFromType<'message'>): event is Bolt.types.GenericMessageEvent => {
  return event && event.type === 'message';
};

type MessageHandler = (event: Bolt.types.GenericMessageEvent) => Promise<void> | void;

export class SlackService {
  private app: Bolt.App | null = null;
  private started = false;
  private messageHandlers: MessageHandler[] = [];

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  private ensureApp(): Bolt.App {
    if (this.app) return this.app;
    const app = new Bolt.App({
      token: this.config.slackBotToken,
      appToken: this.config.slackAppToken,
      socketMode: true,
      logLevel: Bolt.LogLevel ? Bolt.LogLevel.WARN : undefined,
    });

    app.event('message', async ({ event }) => {
      if (!isMessageEvent(event)) return;
      try {
        for (const handler of this.messageHandlers) {
          await handler(event as Bolt.types.GenericMessageEvent);
        }
      } catch (err) {
        this.logger.error('SlackService message handler error', err);
      }
    });

    this.app = app;
    return app;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const app = this.ensureApp();
    this.logger.info('Starting SlackService (socket mode)...');
    await app.start();
    this.started = true;
    this.logger.info('SlackService started');
  }

  async stop(): Promise<void> {
    if (!this.started || !this.app) return;
    try {
      // @ts-ignore internal access fallback
      const sm = this.app.receiver?.client?.socketModeClient;
      if (sm && typeof sm.disconnect === 'function') await sm.disconnect();
      this.logger.info('SlackService stopped');
    } catch (err) {
      this.logger.error('Error stopping SlackService', err);
    } finally {
      this.started = false;
    }
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  get client() {
    return this.ensureApp().client;
  }

  async sendMessage(payload: SlackMessagePayload) {
    const { channel, text, thread_ts, broadcast, ephemeral_user } = payload;
    try {
      if (ephemeral_user) {
        const resp = await this.client.chat.postEphemeral({ channel, user: ephemeral_user, text, thread_ts });
        if (!resp.ok) return { ok: false, error: resp.error };
        return { ok: true, channel, message_ts: resp.message_ts, ephemeral: true };
      }
      const args: any = { channel, text };
      if (thread_ts) args.thread_ts = thread_ts;
      if (thread_ts && broadcast) args.reply_broadcast = true;
      const resp = await this.client.chat.postMessage(args);
      if (!resp.ok) {
        this.logger.error('Slack chat.postMessage error', resp.error);
        return { ok: false, error: resp.error };
      }
      return {
        ok: true,
        channel: resp.channel,
        ts: resp.ts,
        thread_ts: (resp as any).message?.thread_ts || thread_ts || resp.ts,
        broadcast: !!broadcast,
      };
    } catch (err: any) {
      this.logger.error('Error sending Slack message', err);
      return { ok: false, error: err.message || String(err) };
    }
  }
}
