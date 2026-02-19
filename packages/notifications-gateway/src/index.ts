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

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const httpServer = createServer();
  const io = createSocketServer({ server: httpServer, path: config.socketPath, logger });
  const subscriber = new NotificationsSubscriber(
    { url: config.redisUrl, channel: config.redisChannel },
    logger,
  );

  subscriber.on('notification', (envelope: NotificationEnvelope) => dispatchToRooms(io, envelope, logger));
  subscriber.on('error', (error: Error) => {
    logger.error({ error: serializeError(error) }, 'redis subscriber emitted error');
  });

  await subscriber.start();

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen({ port: config.port, host: config.host }, () => {
      logger.info({ port: config.port, host: config.host, path: config.socketPath }, 'gateway listening');
      httpServer.off('error', reject);
      resolve();
    });
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'shutting down notifications gateway');
    httpServer.close();
    await subscriber.stop();
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void main().catch((error) => {
  const serialized = serializeError(error);
  // eslint-disable-next-line no-console -- fallback for bootstrap errors
  console.error('notifications-gateway failed to start', serialized);
  process.exit(1);
});
