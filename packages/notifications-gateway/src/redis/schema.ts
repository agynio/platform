import { z } from 'zod';
import type { NotificationEnvelope } from '@agyn/shared';
import { RoomSchema } from '../rooms';

export const NotificationEnvelopeSchema: z.ZodType<NotificationEnvelope> = z
  .object({
    id: z.string().min(1),
    ts: z.string().datetime(),
    source: z.literal('platform-server'),
    rooms: z.array(RoomSchema).min(1),
    event: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();
