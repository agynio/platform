import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsSubscriber } from './notifications-subscriber';
import type { Logger } from '../logger';

class RedisStub extends EventEmitter {
  connect = vi.fn(async () => {});
  subscribe = vi.fn(async () => 1);
  quit = vi.fn(async () => {});
}

type RedisCtorArgs = [string, Record<string, unknown>?];

const redisFactory = vi.fn<RedisStub, RedisCtorArgs>();

vi.mock('ioredis', () => ({
  default: vi.fn((...args: RedisCtorArgs) => redisFactory(...args)),
}));

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }) as unknown as Logger;

describe('NotificationsSubscriber', () => {
  const options = { url: 'redis://localhost:6379/0', channel: 'notifications.v1' } as const;
  let redis: RedisStub;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = new RedisStub();
    redisFactory.mockImplementation(() => redis);
  });

  it('emits parsed notifications when payload is valid', async () => {
    const logger = createLogger();
    const subscriber = new NotificationsSubscriber(options, logger);
    const notificationSpy = vi.fn();
    subscriber.on('notification', notificationSpy);

    await subscriber.start();
    const envelope = {
      id: 'evt-1',
      ts: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      source: 'platform-server' as const,
      rooms: ['graph'],
      event: 'thread_updated',
      payload: { foo: 'bar' },
    };

    redis.emit('message', options.channel, JSON.stringify(envelope));

    expect(notificationSpy).toHaveBeenCalledWith(envelope);
    await subscriber.stop();
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  it('logs and skips invalid payloads', async () => {
    const logger = createLogger();
    const subscriber = new NotificationsSubscriber(options, logger);
    const notificationSpy = vi.fn();
    subscriber.on('notification', notificationSpy);

    await subscriber.start();
    redis.emit('message', options.channel, '{not-json');

    expect(notificationSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ raw: '{not-json' }),
      'failed to parse notification',
    );
  });

  it('surfaces subscription failures via error events without crashing', async () => {
    const logger = createLogger();
    const subscriber = new NotificationsSubscriber(options, logger);
    const errorSpy = vi.fn();
    subscriber.on('error', errorSpy);
    const failure = new Error('subscribe failed');
    redis.subscribe.mockRejectedValueOnce(failure);

    await expect(subscriber.start()).rejects.toThrow(failure);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channel: options.channel, error: { name: 'Error', message: failure.message } }),
      'failed to subscribe to notifications channel',
    );
    expect(errorSpy).toHaveBeenCalledWith(failure);
  });
});
