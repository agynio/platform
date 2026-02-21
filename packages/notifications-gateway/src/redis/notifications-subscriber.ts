import { EventEmitter } from 'node:events';
import Redis from 'ioredis';
import type { Logger } from '../logger.js';
import type { NotificationEnvelope } from '@agyn/shared';
import { NotificationEnvelopeSchema } from './schema.js';
import { serializeError } from '../errors.js';

export class NotificationsSubscriber extends EventEmitter {
  private redis: Redis | null = null;

  constructor(
    private readonly options: { url: string; channel: string },
    private readonly logger: Logger,
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.redis) return;
    this.redis = new Redis(this.options.url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      autoResubscribe: true,
    });
    this.redis.on('error', (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error({ error: serializeError(err) }, 'redis subscriber error');
      this.emit('error', err);
    });
    this.redis.on('ready', () => {
      this.logger.info('redis subscriber ready');
      this.emit('ready');
    });
    await this.redis.connect();
    try {
      await this.redis.subscribe(this.options.channel);
      this.logger.info({ channel: this.options.channel }, 'subscribed to notifications channel');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { channel: this.options.channel, error: serializeError(err) },
        'failed to subscribe to notifications channel',
      );
      this.emit('error', err);
      throw err;
    }
    this.redis.on('message', (channel, message) => {
      if (channel !== this.options.channel) return;
      this.handleMessage(message);
    });
  }

  async stop(): Promise<void> {
    if (!this.redis) return;
    const current = this.redis;
    this.redis = null;
    current.removeAllListeners('message');
    await current.quit();
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      const notification = NotificationEnvelopeSchema.parse(parsed);
      this.emit('notification', notification);
    } catch (error) {
      this.logger.warn({ error: serializeError(error), raw }, 'failed to parse notification');
    }
  }
}
