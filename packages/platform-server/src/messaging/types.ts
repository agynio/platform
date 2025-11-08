import { z } from 'zod';
import type { VaultRef } from '../vault/vault.service';

// Channel descriptor variants
export const SlackIdentifiersSchema = z
  .object({
    channelId: z.string().min(1),
    threadTs: z.string().min(1).nullable().optional(),
    ephemeralUser: z.string().min(1).nullable().optional(),
  })
  .strict();

export const GithubIssueIdentifiersSchema = z
  .object({ owner: z.string().min(1), repo: z.string().min(1), issueNumber: z.number().int().nonnegative() })
  .strict();

export const EmailIdentifiersSchema = z
  .object({ to: z.string().min(1), threadId: z.string().min(1).nullable().optional(), inReplyTo: z.string().min(1).nullable().optional() })
  .strict();

export const InternalChatIdentifiersSchema = z
  .object({ roomId: z.string().min(1), threadId: z.string().min(1).nullable().optional() })
  .strict();

export const DiscordIdentifiersSchema = z
  .object({ channelId: z.string().min(1), threadId: z.string().min(1).nullable().optional() })
  .strict();

export const ChannelDescriptorSchema = z
  .object({
    type: z.enum(['slack', 'github_issue', 'email', 'internal_chat', 'discord']),
    identifiers: z.union([
      SlackIdentifiersSchema,
      GithubIssueIdentifiersSchema,
      EmailIdentifiersSchema,
      InternalChatIdentifiersSchema,
      DiscordIdentifiersSchema,
    ]),
    meta: z.record(z.string(), z.unknown()).default({}),
    createdBy: z.string().optional(),
    version: z.number().int().optional(),
  })
  .strict();

export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;

export type SendMessageOptions = {
  correlationId?: string;
  broadcast?: boolean;
  markdown?: boolean;
  attachments?: Array<{ type: 'file' | 'link'; url?: string; name?: string }>;
  replyTo?: string | null;
};

export type SendResult = {
  ok: boolean;
  channelMessageId?: string | null;
  threadId?: string | null;
  error?: string | null;
  rateLimited?: boolean;
  retryAfterMs?: number | null;
};

export interface ChannelAdapterDeps {
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void };
  // Minimal, explicit Vault surface avoids cross-module class typing issues
  vault: { getSecret: (ref: VaultRef) => Promise<string | undefined> };
  // Adapter configuration shape (Slack only for now)
  config: { slack: { botToken?: string | { value: string; source?: 'static' | 'vault' } } };
}

export interface ChannelAdapter {
  sendText(input: {
    threadId: string;
    text: string;
    descriptor: ChannelDescriptor;
    options?: SendMessageOptions;
  }): Promise<SendResult>;
}
