#!/usr/bin/env node
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { io as createSocketClient } from 'socket.io-client';

const DEFAULTS = {
  envoyBaseUrl: 'http://localhost:8080',
  socketPath: '/socket.io',
  redisUrl: 'redis://localhost:6379/0',
  channel: 'notifications.v1',
  room: 'thread:test',
  eventName: 'notifications:e2e',
  connectTimeoutMs: 15_000,
  receiptTimeoutMs: 15_000,
};

const loadConfig = (env) => {
  const envoyBaseUrl = (env.ENVOY_BASE_URL ?? DEFAULTS.envoyBaseUrl).trim();
  const socketPath = (env.SOCKET_IO_PATH ?? DEFAULTS.socketPath).trim();
  const redisUrl = (env.NOTIFICATIONS_REDIS_URL ?? DEFAULTS.redisUrl).trim();
  const channel = (env.NOTIFICATIONS_CHANNEL ?? DEFAULTS.channel).trim();
  const room = (env.NOTIFICATIONS_ROOM ?? DEFAULTS.room).trim();
  const eventName = (env.NOTIFICATIONS_EVENT ?? DEFAULTS.eventName).trim();
  const connectTimeoutMs = toPositiveInt(env.CONNECT_TIMEOUT_MS) ?? DEFAULTS.connectTimeoutMs;
  const receiptTimeoutMs = toPositiveInt(env.RECEIPT_TIMEOUT_MS) ?? DEFAULTS.receiptTimeoutMs;

  assertNonEmpty(envoyBaseUrl, 'ENVOY_BASE_URL');
  assertNonEmpty(socketPath, 'SOCKET_IO_PATH');
  assertNonEmpty(redisUrl, 'NOTIFICATIONS_REDIS_URL');
  assertNonEmpty(channel, 'NOTIFICATIONS_CHANNEL');
  assertNonEmpty(room, 'NOTIFICATIONS_ROOM');
  assertNonEmpty(eventName, 'NOTIFICATIONS_EVENT');

  return {
    envoyBaseUrl,
    socketPath,
    redisUrl,
    channel,
    room,
    eventName,
    connectTimeoutMs,
    receiptTimeoutMs,
  };
};

const assertNonEmpty = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
};

const toPositiveInt = (value) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const connectSocket = (socket, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`socket connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const handleConnect = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      const err = error instanceof Error ? error : new Error(String(error));
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleError);
      socket.off('error', handleError);
    };

    socket.once('connect', handleConnect);
    socket.once('connect_error', handleError);
    socket.once('error', handleError);
  });

const subscribeToRoom = (socket, room, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`subscribe ack timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const handleAck = (response) => {
      cleanup();
      if (!response || typeof response !== 'object' || response.ok !== true) {
        reject(new Error(`subscribe rejected: ${JSON.stringify(response)}`));
        return;
      }
      resolve(response.rooms ?? []);
    };

    const cleanup = () => {
      clearTimeout(timer);
    };

    socket.emit('subscribe', { room }, handleAck);
  });

const waitForEvent = (socket, eventName, marker, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${eventName} within ${timeoutMs}ms`));
    }, timeoutMs);

    const handleEvent = (payload) => {
      if (!payload || typeof payload !== 'object' || payload.marker !== marker) {
        return;
      }
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, handleEvent);
    };

    socket.on(eventName, handleEvent);
  });

const publishEnvelope = async (redis, channel, room, eventName, marker) => {
  const envelope = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    source: 'platform-server',
    rooms: [room],
    event: eventName,
    payload: {
      marker,
      note: 'notifications-e2e',
      room,
    },
  };
  await redis.publish(channel, JSON.stringify(envelope));
  return envelope;
};

const run = async (config) => {
  const socket = createSocketClient(config.envoyBaseUrl, {
    path: config.socketPath,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: config.connectTimeoutMs,
  });
  const redis = new Redis(config.redisUrl, { lazyConnect: true });

  try {
    await Promise.all([connectSocket(socket, config.connectTimeoutMs), redis.connect()]);
    console.log('connected to envoy');
    const subscribedRooms = await subscribeToRoom(socket, config.room, config.connectTimeoutMs);
    console.log('subscribed to rooms', subscribedRooms);
    const marker = randomUUID();
    const receipt = waitForEvent(socket, config.eventName, marker, config.receiptTimeoutMs);
    await publishEnvelope(redis, config.channel, config.room, config.eventName, marker);
    console.log('published notification, awaiting receipt');
    const payload = await receipt;
    console.log('received payload', payload);
  } finally {
    socket.disconnect();
    try {
      await redis.quit();
    } catch {
      // ignore redis quit errors
    }
  }
};

const main = async () => {
  const config = loadConfig(process.env);
  await run(config);
};

main()
  .then(() => {
    console.log('notifications websocket check succeeded');
    process.exit(0);
  })
  .catch((error) => {
    console.error('notifications websocket check failed', error);
    process.exit(1);
  });
