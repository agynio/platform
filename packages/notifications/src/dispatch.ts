import type { NotificationEnvelope } from '@agyn/shared';
import type { Server as SocketIOServer } from 'socket.io';
import type { Logger } from './logger';
import { serializeError } from './errors';

export const dispatchToRooms = (
  io: SocketIOServer,
  envelope: NotificationEnvelope,
  logger: Logger,
): void => {
  for (const room of envelope.rooms) {
    try {
      io.to(room).emit(envelope.event, envelope.payload);
    } catch (error) {
      logger.warn({ room, event: envelope.event, error: serializeError(error) }, 'emit failed');
    }
  }
};
