import { z } from 'zod';

export const RoomSchema = z.union([
  z.literal('threads'),
  z.literal('graph'),
  z.string().regex(/^thread:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^run:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^node:[0-9a-z-]{1,64}$/i),
]);

export const SubscribePayloadSchema = z
  .object({
    rooms: z.array(RoomSchema).min(1).optional(),
    room: RoomSchema.optional(),
  })
  .strict();

export const PublishInputSchema = z.object({
  rooms: z.array(RoomSchema).min(1),
  event: z.string().min(1),
  source: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type PublishInput = z.infer<typeof PublishInputSchema>;
export type SubscribePayload = z.infer<typeof SubscribePayloadSchema>;
