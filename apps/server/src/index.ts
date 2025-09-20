import http from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';
import { CheckpointerService } from './services/checkpointer.service.js';
import { SocketService } from './services/socket.service.js';

const logger = new LoggerService();
const config = ConfigService.fromEnv();
const mongo = new MongoService(config, logger);
const checkpointer = new CheckpointerService(logger);

async function bootstrap() {
  await mongo.connect();
  checkpointer.attachMongoClient(mongo.getClient());
  checkpointer.bindDb(mongo.getDb());

  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });
  const socketService = new SocketService(io, logger, checkpointer);
  socketService.register();

  const PORT = process.env.PORT || 3010;
  server.listen(PORT, () => {
    logger.info(`Socket server listening on :${PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await mongo.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  logger.error('Bootstrap failure', e);
  process.exit(1);
});
