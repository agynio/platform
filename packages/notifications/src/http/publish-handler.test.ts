import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationEnvelope } from '@agyn/shared';
import { createPublishHandler } from './publish-handler';
import type { Logger } from '../logger';

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }) as unknown as Logger;

const startServer = (handler: ReturnType<typeof createPublishHandler>): Promise<{ server: Server; url: string }> =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void handler(req, res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to bind test server'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });

describe('createPublishHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('accepts valid publish requests and dispatches envelopes', async () => {
    const logger = createLogger();
    const dispatch = vi.fn();
    const nowIso = new Date().toISOString();
    const handler = createPublishHandler({
      logger,
      dispatch: (envelope: NotificationEnvelope) => dispatch(envelope),
    });
    const { server, url } = await startServer(handler);

    try {
      const response = await fetch(`${url}/internal/notifications/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'run_status_changed',
          rooms: ['thread:123', 'run:123'],
          payload: {
            threadId: '11111111-1111-4111-8111-111111111112',
            run: {
              id: '11111111-1111-4111-8111-111111111113',
              threadId: '11111111-1111-4111-8111-111111111112',
              status: 'running',
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          },
          source: 'platform-server',
          traceId: 'trace-123',
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; id: string; ts: string };
      expect(body.ok).toBe(true);
      expect(body.ts).toBe(nowIso);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(dispatch).toHaveBeenCalledTimes(1);
      const envelope = dispatch.mock.calls[0][0] as NotificationEnvelope;
      expect(envelope).toMatchObject({
        id: body.id,
        source: 'platform-server',
        event: 'run_status_changed',
        rooms: ['thread:123', 'run:123'],
      });
      expect(envelope.payload).toEqual({
        threadId: '11111111-1111-4111-8111-111111111112',
        run: {
          id: '11111111-1111-4111-8111-111111111113',
          threadId: '11111111-1111-4111-8111-111111111112',
          status: 'running',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      });
      expect(logger.info).toHaveBeenCalled();
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('rejects malformed requests with 400', async () => {
    const handler = createPublishHandler({ logger: createLogger(), dispatch: vi.fn() });
    const { server, url } = await startServer(handler);

    try {
      const response = await fetch(`${url}/internal/notifications/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rooms: [], payload: {} }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: 'validation_failed' });
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });

  it('rejects unknown events with 422', async () => {
    const handler = createPublishHandler({ logger: createLogger(), dispatch: vi.fn() });
    const { server, url } = await startServer(handler);

    try {
      const response = await fetch(`${url}/internal/notifications/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'unknown_event',
          rooms: ['graph'],
          payload: {},
        }),
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ ok: false, error: 'unprocessable_entity' });
    } finally {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
  });
});
