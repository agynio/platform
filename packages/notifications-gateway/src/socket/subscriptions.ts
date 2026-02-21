import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { Logger } from '../logger.js';
import { RoomSchema, type ValidRoom } from '../rooms.js';

const SubscribeSchema = z
  .object({
    rooms: z.array(RoomSchema).optional(),
    room: RoomSchema.optional(),
  })
  .strict();

type SubscribePayload = z.infer<typeof SubscribeSchema>;

export function attachSubscribeHandler(socket: Socket, logger: Logger): void {
  socket.on('subscribe', (payload: unknown, ack?: (response: unknown) => void) => {
    const parsed = SubscribeSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }));
      logger.warn({ socketId: socket.id, issues }, 'subscribe payload invalid');
      if (typeof ack === 'function') ack({ ok: false, error: 'invalid_payload', issues });
      return;
    }
    const rooms = collectRooms(parsed.data);
    for (const room of rooms) socket.join(room);
    if (typeof ack === 'function') ack({ ok: true, rooms });
  });

  socket.on('error', (error: unknown) => {
    logger.warn({ socketId: socket.id, error: serializeError(error) }, 'socket error');
  });
}

const collectRooms = (payload: SubscribePayload): ValidRoom[] => {
  if (payload.rooms && payload.rooms.length > 0) return payload.rooms;
  if (payload.room) return [payload.room];
  return [];
};

const serializeError = (error: unknown): { name?: string; message: string } => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === 'object') {
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: '[object]' };
    }
  }
  return { message: String(error) };
};
