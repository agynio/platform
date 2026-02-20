import { randomUUID } from 'node:crypto';
import { createServer, type Server as HTTPServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket } from 'socket.io-client';
import Redis from 'ioredis';
import type { NotificationEnvelope } from '@agyn/shared';
import { describe, expect, test, vi } from 'vitest';
import { createLogger } from '../src/logger';
import { createSocketServer } from '../src/socket/server';
import { NotificationsSubscriber } from '../src/redis/notifications-subscriber';
import { dispatchToRooms } from '../src/dispatch';

vi.mock('ioredis', () => import('./in-memory-redis.mock'));

const TEST_CHANNEL = 'notifications.v1';
const TEST_ROOM = 'thread:e2e-room';
const TEST_EVENT = 'thread.message';

type SubscribeAck = { ok: boolean; rooms?: string[]; error?: string };

const listen = (server: HTTPServer): Promise<number> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to determine server port'));
        return;
      }
      resolve((address as AddressInfo).port);
    });
  });

const closeServer = (server: HTTPServer): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const waitForConnection = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });

describe('notifications gateway e2e', () => {
  test('delivers envelopes published to redis to subscribed clients', async () => {
    const httpServer = createServer();
    const logger = createLogger('fatal');
    const io = createSocketServer({ server: httpServer, path: '/socket.io', logger });
    const port = await listen(httpServer);

    const subscriber = new NotificationsSubscriber(
      { url: 'redis://in-memory', channel: TEST_CHANNEL },
      logger,
    );
    subscriber.on('notification', (envelope: NotificationEnvelope) => dispatchToRooms(io, envelope, logger));
    await subscriber.start();

    const client = createClient(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    let publisher: Redis | null = null;
    try {
      await waitForConnection(client);

      const payloadPromise = new Promise<unknown>((resolve) => {
        client.once(TEST_EVENT, (data) => resolve(data));
      });

      const ack = await new Promise<SubscribeAck>((resolve, reject) => {
        const onError = (error: Error) => {
          client.off('error', onError);
          reject(error);
        };
        client.on('error', onError);
        client.emit('subscribe', { room: TEST_ROOM }, (response: SubscribeAck) => {
          client.off('error', onError);
          resolve(response);
        });
      });

      if (!ack.ok) {
        throw new Error(`subscribe failed: ${ack.error ?? 'unknown error'}`);
      }
      expect(ack.rooms).toEqual([TEST_ROOM]);

      const envelope: NotificationEnvelope = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        source: 'platform-server',
        rooms: [TEST_ROOM],
        event: TEST_EVENT,
        payload: { text: 'ping' },
      };

      publisher = new Redis('redis://in-memory');
      await publisher.connect();
      await publisher.publish(TEST_CHANNEL, JSON.stringify(envelope));

      const received = await payloadPromise;
      expect(received).toEqual(envelope.payload);
    } finally {
      client.close();
      io.close();
      await subscriber.stop();
      await closeServer(httpServer);
      if (publisher) await publisher.quit();
    }
  }, 15000);
});
