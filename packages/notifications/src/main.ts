import { loadConfig } from './config';
import { createLogger } from './logger';
import { NotificationBroadcaster } from './broadcaster';
import { SocketBridge } from './socket';
import { GrpcServer } from './grpc';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const broadcaster = new NotificationBroadcaster(logger);
const socket = new SocketBridge({
  host: config.host,
  port: config.socketPort,
  path: config.socketPath,
  corsOrigins: config.socketCorsOrigins,
  logger,
});
const grpc = new GrpcServer({
  host: config.host,
  port: config.grpcPort,
  broadcaster,
  socket,
  logger,
});

const start = async () => {
  try {
    await socket.start();
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
    await Promise.all([grpc.close(), socket.close()]);
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
