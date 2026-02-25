// @vitest-environment node

import { createServer, type Server as HTTPServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import type { NotificationEnvelope } from '@agyn/shared';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createSocketServer } from './socket/server';
import { NotificationsSubscriber } from './redis/notifications-subscriber';
import { dispatchToRooms } from './dispatch';
import type { Logger } from './logger';

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }) as unknown as Logger;

const TEST_CHANNEL = 'notifications.v1' as const;
const SOCKET_PATH = '/socket.io';
const SOCKET_PING_INTERVAL_MS = 25_000;
const SOCKET_PING_TIMEOUT_MS = 20_000;

describe('notifications gateway redis → socket flow', () => {
  let server: HTTPServer | null = null;
  let io: ReturnType<typeof createSocketServer> | null = null;
  let subscriber: NotificationsSubscriber | null = null;
  let publisher: Redis | null = null;
  let socket: Socket | null = null;
  let redisContainer: StartedTestContainer | null = null;
  let redisUrl: string | null = null;

  beforeAll(async () => {
    redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const port = redisContainer.getMappedPort(6379);
    redisUrl = `redis://127.0.0.1:${port}/0`;
  }, 45000);

  afterEach(async () => {
    socket?.disconnect();
    socket = null;
    if (subscriber) {
      await subscriber.stop();
      subscriber.removeAllListeners();
      subscriber = null;
    }
    if (io) {
      io.close();
      io = null;
    }
    if (publisher) {
      if (typeof publisher.quit === 'function') {
        await publisher.quit();
      } else {
        publisher.disconnect();
      }
      publisher = null;
    }
    if (server) {
      const current = server;
      server = null;
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  });

  afterAll(async () => {
    if (redisContainer) {
      await redisContainer.stop();
      redisContainer = null;
    }
  });

  it(
    'delivers published notifications to subscribed websocket rooms via dedicated socket path',
    async () => {
      const logger = createLogger();
      server = createServer();
      io = createSocketServer({
        server,
        path: SOCKET_PATH,
        logger,
        corsOrigin: '*',
        pingIntervalMs: SOCKET_PING_INTERVAL_MS,
        pingTimeoutMs: SOCKET_PING_TIMEOUT_MS,
      });

      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', () => {
          server!.off('error', reject);
          resolve();
        });
      });

      const address = server.address() as AddressInfo | null;
      if (!address || typeof address === 'string') {
        throw new Error('failed to obtain listening address');
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      if (!redisUrl) throw new Error('redis container not started');

      subscriber = new NotificationsSubscriber({ url: redisUrl, channel: TEST_CHANNEL }, logger);
      subscriber.on('notification', (envelope) => {
        if (io) dispatchToRooms(io, envelope, logger);
      });
      await subscriber.start();

      publisher = new Redis(redisUrl);

      socket = createSocketClient(baseUrl, {
        path: SOCKET_PATH,
        transports: ['websocket'],
        timeout: 4000,
      });

      await new Promise<void>((resolve, reject) => {
        socket!.once('connect', () => resolve());
        socket!.once('connect_error', reject);
      });

      const room = 'node:test-node-42';
      await new Promise<void>((resolve, reject) => {
        socket!.emit('subscribe', { rooms: [room] }, (ack?: { ok?: boolean; rooms?: string[]; error?: string }) => {
          if (ack?.ok) {
            expect(ack.rooms).toContain(room);
            resolve();
            return;
          }
          reject(new Error(`subscribe failed: ${ack?.error ?? 'unknown error'}`));
        });
      });

      const envelope: NotificationEnvelope<'node_status', { nodeId: string; status: string; updatedAt: string }> = {
        id: 'evt-node-status-1',
        ts: new Date('2024-01-01T00:00:00.000Z').toISOString(),
        source: 'platform-server',
        rooms: [room],
        event: 'node_status',
        payload: { nodeId: 'test-node-42', status: 'running', updatedAt: new Date().toISOString() },
      };

      const received = new Promise<typeof envelope.payload>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout waiting for node_status event')), 4000);
        socket!.once('node_status', (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        });
      });

      await publisher.publish(TEST_CHANNEL, JSON.stringify(envelope));
      await expect(received).resolves.toEqual(envelope.payload);

      io?.close();
    },
    15000,
  );

  it('accepts cross-origin websocket handshakes when origin is allowed', async () => {
    const allowedOrigin = 'https://ui.example.com';
    const logger = createLogger();
    server = createServer();
    io = createSocketServer({
      server,
      path: SOCKET_PATH,
      logger,
      corsOrigin: [allowedOrigin],
      pingIntervalMs: SOCKET_PING_INTERVAL_MS,
      pingTimeoutMs: SOCKET_PING_TIMEOUT_MS,
    });

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => {
        server!.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo | null;
    if (!address || typeof address === 'string') {
      throw new Error('failed to obtain listening address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    socket = createSocketClient(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { Origin: allowedOrigin },
      timeout: 3000,
    });

    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', () => resolve());
      socket!.once('connect_error', reject);
    });

    io?.close();
  }, 10000);
});
