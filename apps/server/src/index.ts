import http from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';

const logger = new LoggerService();
const config = ConfigService.fromEnv();
const mongo = new MongoService(config, logger);

async function bootstrap() {
  await mongo.connect();
  const server = http.createServer();
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected ${socket.id}`);
    let closed = false;
    let stream: any; // ChangeStream

    const cleanup = async () => {
      if (stream) {
        try {
          await stream.close();
        } catch (e) {
          logger.error('Error closing change stream', e);
        }
      }
      closed = true;
    };

    socket.on('disconnect', () => {
      cleanup();
    });

    socket.on('init', async (payload) => {
      if (closed) return;
      try {
        const latest = await mongo.fetchLatestWrites(payload);
        socket.emit('initial', { items: latest });
        stream = mongo.watchInserts(payload);
        stream.on('change', (change: any) => {
          if (change.fullDocument) {
            const normalized = mongo.normalize(change.fullDocument);
            socket.emit('append', normalized);
          }
        });
        stream.on('error', (err: any) => {
          logger.error('Change stream error', err);
          socket.emit('error', { message: 'change stream error' });
        });
      } catch (err) {
        logger.error('Init error', err);
        socket.emit('error', { message: 'init error' });
      }
    });
  });

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
