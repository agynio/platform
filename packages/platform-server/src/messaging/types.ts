import { z } from 'zod';
import { ReferenceFieldSchema } from '../utils/refs';

// Slack-only channel descriptor
export const SlackIdentifiersSchema = z
  .object({ channelId: z.string().min(1), threadTs: z.string().min(1).nullable().optional() })
  .strict();

export const SlackAuthSchema = z
  .object({ botToken: z.union([z.string().min(1), ReferenceFieldSchema]) })
  .strict();

export const ChannelDescriptorSchema = z
  .object({
    type: z.literal('slack'),
    identifiers: SlackIdentifiersSchema,
    auth: SlackAuthSchema,
    meta: z.record(z.string(), z.unknown()).default({}),
    createdBy: z.string().optional(),
    version: z.number().int().optional(),
  })
  .strict();

export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;

export type SendResult = {
  ok: boolean;
  channelMessageId?: string | null;
  threadId?: string | null;
  error?: string | null;
};

export interface ChannelAdapterDeps {
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void };
  vault: { getSecret: (ref: { mount: string; path: string; key: string }) => Promise<string | undefined> };
}

export interface ChannelAdapter {
  sendText(input: { threadId: string; text: string; descriptor: ChannelDescriptor }): Promise<SendResult>;
}
