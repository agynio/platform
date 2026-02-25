import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { ConfigService } from '../src/core/services/config.service';
import { NotificationsClient } from '../src/notifications/notifications.client';
import type { EnvSnapshot } from './notifications.test-helpers';
import { initNotificationsConfig, resetNotificationsConfig } from './notifications.test-helpers';

const fetchMock = vi.hoisted(() => vi.fn());
const sleepMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('node-fetch-native', () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('node:timers/promises', () => ({
  setTimeout: (...args: unknown[]) => sleepMock(...args),
}));

describe('NotificationsClient', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = initNotificationsConfig();
    fetchMock.mockReset();
    sleepMock.mockReset();
  });

  afterEach(() => {
    resetNotificationsConfig(envSnapshot);
    vi.restoreAllMocks();
  });

  it('sends publish requests with expected payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    });
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const client = new NotificationsClient(ConfigService.getInstance());
    await client.publish('run_status_changed', ['thread:abc'], { runId: 'run-1' }, { traceId: 'trace-123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method?: string; headers?: Record<string, string>; body?: unknown }];
    expect(url).toBe('http://localhost:4000/internal/notifications/publish');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    const body = JSON.parse((init.body as string) ?? 'null');
    expect(body).toEqual({
      event: 'run_status_changed',
      rooms: ['thread:abc'],
      payload: { runId: 'run-1' },
      source: 'platform-server',
      traceId: 'trace-123',
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips publish when no rooms are provided', async () => {
    const client = new NotificationsClient(ConfigService.getInstance());
    await client.publish('run_status_changed', [], { runId: 'run-1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries failures and logs warnings before giving up', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'upstream unavailable',
    });
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const client = new NotificationsClient(ConfigService.getInstance());
    await expect(client.publish('thread_updated', ['thread:xyz'], { threadId: 'thread-1' })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('validates NOTIFICATIONS_HTTP_URL presence in configuration', () => {
    delete process.env.NOTIFICATIONS_HTTP_URL;
    ConfigService.clearInstanceForTest();

    expect(() => ConfigService.fromEnv()).toThrow(/expected string, received undefined/i);
  });
});
