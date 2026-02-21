import { z } from 'zod';
import type { NotificationRoom } from '@agyn/shared';

const BaseRoomSchema = z.union([
  z.literal('graph'),
  z.literal('threads'),
  z.string().regex(/^thread:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^run:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^node:[0-9a-z-]{1,64}$/i),
]);

export const RoomSchema: z.ZodType<NotificationRoom> = BaseRoomSchema.transform(
  (value) => value as NotificationRoom,
);

export type ValidRoom = z.infer<typeof RoomSchema>;
