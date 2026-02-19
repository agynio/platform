import type { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer, type ServerOptions } from 'socket.io';
import type { Logger } from '../logger';
import { attachSubscribeHandler } from './subscriptions';

export const createSocketServer = (params: {
  server: HTTPServer;
  path: string;
  logger: Logger;
}): SocketIOServer => {
  const options: Partial<ServerOptions> = {
    path: params.path,
    transports: ['websocket'],
    cors: { origin: '*' },
    serveClient: false,
    allowRequest: (_req, callback) => callback(null, true),
  };
  const io = new SocketIOServer(params.server, options);
  io.on('connection', (socket) => {
    params.logger.info({ socketId: socket.id }, 'socket connected');
    attachSubscribeHandler(socket, params.logger);
  });
  return io;
};
