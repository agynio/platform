import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const TRACKED_KEYS = [
  'PORT',
  'HOST',
  'SOCKET_IO_PATH',
  'NOTIFICATIONS_REDIS_URL',
  'NOTIFICATIONS_REDIS_ENABLED',
  'NOTIFICATIONS_CHANNEL',
  'LOG_LEVEL',
] as const;
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
  it('enables redis when URL is provided and applies overrides', () => {
    process.env.NOTIFICATIONS_REDIS_URL = 'redis://127.0.0.1:6380/1';
    process.env.NOTIFICATIONS_CHANNEL = 'notifications.v2';
    process.env.PORT = '4010';
    process.env.SOCKET_IO_PATH = 'socket';
    process.env.LOG_LEVEL = 'debug';

    const config = loadConfig();

    expect(config.port).toBe(4010);
    expect(config.socketPath).toBe('/socket');
    expect(config.redis.enabled).toBe(true);
    expect(config.redis.url).toBe('redis://127.0.0.1:6380/1');
    expect(config.redis.channel).toBe('notifications.v2');
    expect(config.logLevel).toBe('debug');
  });

  it('disables redis when no URL or flag is provided', () => {
    const config = loadConfig();

    expect(config.redis.enabled).toBe(false);
    expect(config.redis.url).toBeNull();
    expect(config.redis.channel).toBe('notifications.v1');
    expect(config.port).toBe(4000);
  });

  it('errors when redis is explicitly enabled without URL', () => {
    process.env.NOTIFICATIONS_REDIS_ENABLED = 'true';

    expect(() => loadConfig()).toThrowError(/NOTIFICATIONS_REDIS_URL is required/);
  });
});
