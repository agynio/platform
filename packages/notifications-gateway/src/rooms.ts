import { z } from 'zod';

export const RoomSchema = z.union([
  z.literal('graph'),
  z.literal('threads'),
  z.string().regex(/^thread:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^run:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^node:[0-9a-z-]{1,64}$/i),
]);

export type ValidRoom = z.infer<typeof RoomSchema>;
