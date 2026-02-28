import Redis from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';
import { NotificationBroadcaster } from './broadcaster';
import type { JsonObject, PublishedNotification } from './types';
import { RoomSchema } from './validation';

export type NotificationFanout = {
  publish(notification: PublishedNotification): Promise<void>;
  subscribe(listener: (notification: PublishedNotification) => void): () => void;
};

type RedisNotificationBusOptions = {
  redisUrl: string;
  channel: string;
  logger: Logger;
  createClient?: (label: 'publisher' | 'subscriber') => Redis;
};

const EnvelopeSchema = z
  .object({
    id: z.string().uuid(),
    tsIso: z.string().datetime(),
    source: z.string().min(1),
    event: z.string().min(1),
    rooms: z.array(RoomSchema).min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

type Envelope = z.infer<typeof EnvelopeSchema>;

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isJsonValue = (value: unknown): boolean => {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isJsonObject(value)) {
    for (const entry of Object.values(value)) {
      if (!isJsonValue(entry)) return false;
    }
    return true;
  }
  return false;
};

const normalizeJsonObject = (value: Record<string, unknown>): JsonObject | null => {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonValue(entry)) {
      return null;
    }
    result[key] = entry as JsonObject[string];
  }
  return result;
};

export class RedisNotificationBus implements NotificationFanout {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly broadcaster: NotificationBroadcaster;
  private readonly logger: Logger;
  private subscribed = false;
  private readonly handleMessageBound: (channel: string, message: string) => void;

  constructor(private readonly options: RedisNotificationBusOptions) {
    const createClient = options.createClient ?? ((label: 'publisher' | 'subscriber') => new Redis(options.redisUrl, {
      lazyConnect: true,
      name: `notifications-${label}`,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
    }));

    this.logger = options.logger.child({ scope: 'redis' });
    this.publisher = createClient('publisher');
    this.subscriber = createClient('subscriber');
    this.broadcaster = new NotificationBroadcaster(this.logger.child({ scope: 'fanout' }));
    this.handleMessageBound = (channel: string, message: string) => this.handleMessage(channel, message);

    this.subscriber.on('message', this.handleMessageBound);
    this.subscriber.on('ready', () => {
      this.logger.info({ channel: this.options.channel }, 'redis subscriber ready');
    });
    this.subscriber.on('reconnecting', (delay: number) => {
      this.logger.warn({ delay }, 'redis subscriber reconnecting');
    });
    this.subscriber.on('end', () => {
      this.logger.error('redis subscriber connection closed');
    });
    this.subscriber.on('error', (error: Error) => {
      this.logger.error({ error: { name: error.name, message: error.message } }, 'redis subscriber error');
    });
    this.publisher.on('error', (error: Error) => {
      this.logger.error({ error: { name: error.name, message: error.message } }, 'redis publisher error');
    });
  }

  async start(): Promise<void> {
    if (this.subscribed) return;
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.options.channel);
    this.subscribed = true;
    this.logger.info({ channel: this.options.channel }, 'redis notifications subscribed');
  }

  async close(): Promise<void> {
    this.subscriber.off('message', this.handleMessageBound);
    if (this.subscribed) {
      try {
        await this.subscriber.unsubscribe(this.options.channel);
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } },
          'failed to unsubscribe from redis channel',
        );
      }
    }
    await Promise.all([this.quitSafely(this.subscriber), this.quitSafely(this.publisher)]);
    this.subscribed = false;
  }

  async publish(notification: PublishedNotification): Promise<void> {
    if (!this.subscribed) {
      throw new Error('redis notification bus not started');
    }
    const envelope: Envelope = {
      id: notification.id,
      tsIso: notification.createdAt.toISOString(),
      source: notification.source,
      event: notification.event,
      rooms: notification.rooms,
      payload: notification.payload,
    };
    const payload = JSON.stringify(envelope);
    await this.publisher.publish(this.options.channel, payload);
  }

  subscribe(listener: (notification: PublishedNotification) => void): () => void {
    return this.broadcaster.subscribe(listener);
  }

  private handleMessage(channel: string, message: string): void {
    if (channel !== this.options.channel) {
      this.logger.warn({ channel }, 'received notification for unexpected channel');
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(message);
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } },
        'failed to parse notification payload',
      );
      return;
    }

    const parsed = EnvelopeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.logger.warn({ issues: parsed.error.issues }, 'invalid notification payload');
      return;
    }

    const { id, tsIso, source, event, rooms, payload } = parsed.data;
    let payloadObject: JsonObject | undefined;
    if (payload) {
      const normalized = normalizeJsonObject(payload);
      if (!normalized) {
        this.logger.warn({ id }, 'invalid notification payload: contains non-JSON values');
        return;
      }
      payloadObject = normalized;
    }
    const createdAt = new Date(tsIso);
    const notification: PublishedNotification = {
      id,
      source,
      event,
      rooms,
      payload: payloadObject,
      createdAt,
    };

    this.broadcaster.publish(notification);
  }

  private async quitSafely(client: Redis): Promise<void> {
    try {
      await client.quit();
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } },
        'redis client quit failed, forcing disconnect',
      );
      client.disconnect(false);
    }
  }
}
