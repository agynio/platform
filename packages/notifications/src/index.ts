import { createServer } from 'node:http';
import process from 'node:process';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createSocketServer } from './socket/server';
import { NotificationsSubscriber } from './redis/notifications-subscriber';
import { dispatchToRooms } from './dispatch';
import { serializeError } from './errors';
import type { NotificationEnvelope } from '@agyn/shared';
import type { Logger } from './logger';
import type { Server as SocketIOServer } from 'socket.io';
import { createPublishHandler } from './http/publish-handler';

const SOCKET_PING_INTERVAL_MS = 25_000;
const SOCKET_PING_TIMEOUT_MS = 20_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const httpServer = createServer();
  const io = createSocketServer({
    server: httpServer,
    path: config.socketPath,
    logger,
    corsOrigin: config.corsOrigin,
    pingIntervalMs: SOCKET_PING_INTERVAL_MS,
    pingTimeoutMs: SOCKET_PING_TIMEOUT_MS,
  });
  const publishHandler = createPublishHandler({
    logger,
    dispatch: (envelope: NotificationEnvelope) => dispatchToRooms(io, envelope, logger),
  });

  httpServer.on('request', (req, res) => {
    const url = req.url ?? '';
    if (!url.startsWith('/internal/notifications/publish')) return;
    void publishHandler(req, res);
  });

  let subscriber: NotificationsSubscriber | null = null;
  if (config.redis.enabled && config.redis.url) {
    subscriber = new NotificationsSubscriber({ url: config.redis.url, channel: config.redis.channel }, logger);
    subscriber.on('notification', (envelope: NotificationEnvelope) => dispatchToRooms(io, envelope, logger));
    subscriber.on('error', (error: Error) => {
      logger.error({ error: serializeError(error) }, 'redis subscriber emitted error');
    });
    await subscriber.start();
  } else {
    logger.info('redis subscription disabled');
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen({ port: config.port, host: config.host }, () => {
      logger.info({ port: config.port, host: config.host, path: config.socketPath }, 'notifications service listening');
      httpServer.off('error', reject);
      resolve();
    });
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'shutting down notifications service');
    httpServer.close();
    if (subscriber) {
      await subscriber.stop();
      subscriber.removeAllListeners();
    }
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void main().catch((error) => {
  const serialized = serializeError(error);
  // eslint-disable-next-line no-console -- fallback for bootstrap errors
  console.error('notifications service failed to start', serialized);
  process.exit(1);
});
