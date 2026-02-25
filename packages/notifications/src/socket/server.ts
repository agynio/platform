import type { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer, type ServerOptions } from 'socket.io';
import type { Logger } from '../logger';
import { attachSubscribeHandler } from './subscriptions';

export const createSocketServer = (params: {
  server: HTTPServer;
  path: string;
  logger: Logger;
  corsOrigin: '*' | string[];
  pingIntervalMs: number;
  pingTimeoutMs: number;
}): SocketIOServer => {
  const origin = params.corsOrigin === '*' ? '*' : params.corsOrigin;
  const options: Partial<ServerOptions> = {
    path: params.path,
    transports: ['websocket'],
    cors: {
      origin,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: false,
    },
    serveClient: false,
    allowEIO3: false,
    pingInterval: params.pingIntervalMs,
    pingTimeout: params.pingTimeoutMs,
  };
  const io = new SocketIOServer(params.server, options);
  io.on('connection', (socket) => {
    params.logger.info({ socketId: socket.id }, 'socket connected');
    attachSubscribeHandler(socket, params.logger);
  });
  return io;
};
