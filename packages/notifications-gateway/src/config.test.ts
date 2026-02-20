import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const TRACKED_KEYS = ['PORT', 'HOST', 'SOCKET_IO_PATH', 'NOTIFICATIONS_REDIS_URL', 'NOTIFICATIONS_CHANNEL', 'LOG_LEVEL'] as const;
const snapshots: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of TRACKED_KEYS) {
    snapshots[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of TRACKED_KEYS) {
    const value = snapshots[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('loadConfig', () => {
  it('loads redis configuration and overrides defaults from env', () => {
    process.env.NOTIFICATIONS_REDIS_URL = 'redis://127.0.0.1:6380/1';
    process.env.NOTIFICATIONS_CHANNEL = 'notifications.v2';
    process.env.PORT = '4000';
    process.env.SOCKET_IO_PATH = 'socket';
    process.env.LOG_LEVEL = 'debug';

    const config = loadConfig();

    expect(config.port).toBe(4000);
    expect(config.socketPath).toBe('/socket');
    expect(config.notificationsRedisUrl).toBe('redis://127.0.0.1:6380/1');
    expect(config.redisChannel).toBe('notifications.v2');
    expect(config.logLevel).toBe('debug');
  });

  it('falls back to the default notifications channel when unset', () => {
    process.env.NOTIFICATIONS_REDIS_URL = 'redis://127.0.0.1:6379/0';

    const config = loadConfig();

    expect(config.redisChannel).toBe('notifications.v1');
  });
});
