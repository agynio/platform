import { loadConfig } from './config';
import { createLogger } from './logger';
import { GrpcServer } from './grpc';
import { RedisNotificationBus } from './redis-notifications';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const notifications = new RedisNotificationBus({
  channel: config.redisChannel,
  redisUrl: config.redisUrl,
  logger,
});
const grpc = new GrpcServer({
  host: config.host,
  port: config.grpcPort,
  notifications,
  logger,
});

const start = async () => {
  try {
    await notifications.start();
    await grpc.start();
    logger.info('notifications service started');
  } catch (error) {
    logger.error({ error }, 'failed to start notifications service');
    process.exitCode = 1;
  }
};

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down notifications service');
  try {
    await Promise.all([grpc.close(), notifications.close()]);
    logger.info('notifications service stopped');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'shutdown failed');
    process.exit(1);
  }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void start();
