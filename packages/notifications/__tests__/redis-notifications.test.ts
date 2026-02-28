import { EventEmitter } from 'node:events';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisNotificationBus } from '../src/redis-notifications';
import type { PublishedNotification } from '../src/types';

class StubRedis extends EventEmitter {
  published: { channel: string; message: string }[] = [];
  subscribedChannel: string | null = null;
  connected = false;
  quitCalled = false;
  disconnectCalled = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async subscribe(channel: string): Promise<number> {
    this.subscribedChannel = channel;
    return 1;
  }

  async unsubscribe(channel: string): Promise<number> {
    if (this.subscribedChannel === channel) {
      this.subscribedChannel = null;
    }
    return 1;
  }

  async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    return 1;
  }

  async quit(): Promise<void> {
    this.quitCalled = true;
    this.connected = false;
  }

  disconnect(): void {
    this.disconnectCalled = true;
    this.connected = false;
  }

  override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}

describe('RedisNotificationBus', () => {
  let publisher: StubRedis;
  let subscriber: StubRedis;
  let bus: RedisNotificationBus;

  beforeEach(() => {
    publisher = new StubRedis();
    subscriber = new StubRedis();
    bus = new RedisNotificationBus({
      redisUrl: 'redis://localhost:6379',
      channel: 'notifications.v1',
      logger: pino({ level: 'silent' }),
      createClient: (label) => (label === 'publisher' ? publisher : subscriber),
    });
  });

  afterEach(async () => {
    await bus.close();
  });

  it('publishes notifications to redis and forwards to listeners', async () => {
    const received: PublishedNotification[] = [];
    bus.subscribe((notification) => received.push(notification));

    await bus.start();

    const notification: PublishedNotification = {
      id: '11111111-1111-4111-8111-111111111111',
      event: 'agent.updated',
      rooms: ['graph'],
      source: 'platform-server',
      payload: { status: 'ready' },
      createdAt: new Date('2025-01-02T03:04:05.000Z'),
    };

    await bus.publish(notification);

    expect(publisher.published).toHaveLength(1);
    const messagePayload = JSON.parse(publisher.published[0]?.message ?? '{}');
    expect(messagePayload).toMatchObject({
      id: notification.id,
      tsIso: notification.createdAt.toISOString(),
      source: notification.source,
      event: notification.event,
      rooms: notification.rooms,
      payload: notification.payload,
    });

    subscriber.emit('message', 'notifications.v1', publisher.published[0]?.message ?? '');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id: notification.id,
      source: notification.source,
      event: notification.event,
      rooms: notification.rooms,
      payload: notification.payload,
    });
    expect(received[0]?.createdAt.toISOString()).toBe(notification.createdAt.toISOString());
  });

  it('drops malformed messages without notifying listeners', async () => {
    const listener = vi.fn();
    bus.subscribe(listener);

    await bus.start();

    subscriber.emit('message', 'notifications.v1', 'not json');
    subscriber.emit('message', 'notifications.v1', JSON.stringify({ id: 'bad-id' }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes and closes redis clients on shutdown', async () => {
    await bus.start();

    await bus.close();

    expect(subscriber.subscribedChannel).toBeNull();
    expect(publisher.quitCalled).toBe(true);
    expect(publisher.connected).toBe(false);
  });
});
