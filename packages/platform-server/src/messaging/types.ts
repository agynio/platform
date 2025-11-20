import { z } from 'zod';

// Slack-only channel descriptor
// thread_ts is optional (omit if not present)
export const SlackIdentifiersSchema = z.object({ channel: z.string().min(1), thread_ts: z.string().min(1).optional() }).strict();

export const ChannelDescriptorSchema = z
  .object({
    type: z.literal('slack'),
    version: z.number().int(),
    identifiers: SlackIdentifiersSchema,
    meta: z
      .object({
        channel_type: z.string().optional(),
        client_msg_id: z.string().optional(),
        event_ts: z.string().optional(),
      })
      .strict()
      .optional(),
    createdBy: z.string().optional(),
  })
  .strict();

export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;

export const SendResultSchema = z
  .object({
    ok: z.boolean(),
    channelMessageId: z.string().nullable().optional(),
    threadId: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  })
  .passthrough();

export type SendResult = z.infer<typeof SendResultSchema>;

export const isSendResult = (value: unknown): value is SendResult => SendResultSchema.safeParse(value).success;

// Adapters are provided via DI; no custom deps bags or adapter interfaces needed for v1.
