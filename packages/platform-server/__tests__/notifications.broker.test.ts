import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { NotificationEnvelope } from '@agyn/shared';
import { ConfigService } from '../src/core/services/config.service';
import { NotificationsBroker } from '../src/notifications/notifications.broker';
import { initNotificationsConfig, resetNotificationsConfig } from './notifications.test-helpers';

class RedisStub {
  connect = vi.fn(async () => {});
  publish = vi.fn(async () => 1);
  quit = vi.fn(async () => {});
}

const redisFactory = vi.fn(() => new RedisStub());

vi.mock('ioredis', () => ({
  default: vi.fn((...args: unknown[]) => redisFactory(...args)),
}));

describe('NotificationsBroker', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = initNotificationsConfig();
    redisFactory.mockImplementation(() => new RedisStub());
  });

  afterEach(() => {
    resetNotificationsConfig(envSnapshot);
    vi.clearAllMocks();
  });

  it('connects to Redis using configured URL and channel', async () => {
    const broker = new NotificationsBroker(ConfigService.getInstance());
    await broker.connect();

    const redis = redisFactory.mock.results[0]?.value as RedisStub | undefined;
    expect(redis).toBeDefined();
    expect(redis?.connect).toHaveBeenCalledTimes(1);
    expect(redisFactory).toHaveBeenCalledWith('redis://localhost:6379/0', expect.objectContaining({ lazyConnect: true }));

    const envelope: NotificationEnvelope = {
      id: 'evt-1',
      ts: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      source: 'platform-server',
      rooms: ['thread:abc'],
      event: 'thread_updated',
      payload: { threadId: 'thread-abc' },
    };
    await broker.publish(envelope);

    expect(redis.publish).toHaveBeenCalledWith('notifications.test', JSON.stringify(envelope));
    await broker.close();
  });

  it('propagates validation errors when NOTIFICATIONS_REDIS_URL is missing', () => {
    delete process.env.NOTIFICATIONS_REDIS_URL;
    ConfigService.clearInstanceForTest();

    expect(() => ConfigService.fromEnv()).toThrow(/notificationsRedisUrl/i);
  });
});
