import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../core/services/vault.service';
import { ReferenceFieldSchema, normalizeTokenRef, parseVaultRef, resolveTokenRef } from '../../../utils/refs';

export const SendSlackMessageToolStaticConfigSchema = z
  .object({
    bot_token: z.union([
      z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
      ReferenceFieldSchema,
    ]),
    default_channel: z.string().optional().describe('Default Slack channel ID when not provided.'),
  })
  .strict();

export const SendSlackMessageToolExposedStaticConfigSchema = z
  .object({
    bot_token: ReferenceFieldSchema.meta({
      'ui:field': 'ReferenceField',
      'ui:help': 'Use "vault" to reference a secret.',
    }),
    default_channel: z.string().optional(),
  })
  .strict();

export const sendSlackInvocationSchema = z
  .object({
    text: z.string().min(1).describe('Message text.'),
    channel: z.string().min(1).describe('Slack channel ID (C..., D... for DM).'),
    thread_ts: z.string().describe('Thread root timestamp to reply within thread.'),
    broadcast: z.union([z.boolean(), z.null()]).describe('If true when replying in thread, broadcast to channel.'),
    ephemeral_user: z
      .union([z.string(), z.null()])
      .describe('If provided, send ephemeral message only visible to this user.'),
  })
  .strict();

type TokenRef = { value: string; source: 'static' | 'vault' };

interface SendSlackDeps {
  getConfig: () => z.infer<typeof SendSlackMessageToolStaticConfigSchema> | null;
  vault?: VaultService;
  logger: LoggerService;
}

export class SendSlackMessageFunctionTool extends FunctionTool<typeof sendSlackInvocationSchema> {
  constructor(private deps: SendSlackDeps) {
    super();
  }
  get name() {
    return 'send_slack_message';
  }
  get description() {
    return 'Send a Slack message (channel or DM). Supports thread replies, broadcast, ephemeral messages.';
  }
  get schema() {
    return sendSlackInvocationSchema;
  }

  async execute(args: z.infer<typeof sendSlackInvocationSchema>): Promise<string> {
    const { channel: channelInput, text, thread_ts, broadcast, ephemeral_user } = args;
    const cfg = this.deps.getConfig();
    if (!cfg) throw new Error('SendSlackMessageTool not configured: bot_token is required');
    const bot = normalizeTokenRef(cfg.bot_token as any) as TokenRef;
    if ((bot.source || 'static') === 'vault') parseVaultRef(bot.value);
    else if (!bot.value.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
    const channel = channelInput || cfg.default_channel;
    if (!channel) throw new Error('channel is required (or set default_channel)');
    const logger = this.deps.logger;
    try {
      const token = await resolveTokenRef(bot, {
        expectedPrefix: 'xoxb-',
        fieldName: 'bot_token',
        vault: this.deps.vault,
      });
      const client = new WebClient(token, { logLevel: undefined });
      if (ephemeral_user) {
        const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({
          channel,
          user: ephemeral_user,
          text,
          thread_ts,
        });
        if (!resp.ok) return JSON.stringify({ ok: false, error: resp.error });
        return JSON.stringify({ ok: true, channel, message_ts: resp.message_ts, ephemeral: true });
      }
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
        attachments: [],
        ...(thread_ts ? { thread_ts } : {}),
        ...(thread_ts && broadcast ? { reply_broadcast: true } : {}),
      } as any);
      if (!resp.ok) return JSON.stringify({ ok: false, error: resp.error });
      const thread =
        (resp.message && 'thread_ts' in resp.message
          ? (resp.message as { thread_ts?: string }).thread_ts
          : undefined) ||
        thread_ts ||
        resp.ts;
      return JSON.stringify({
        ok: true,
        channel: resp.channel,
        ts: resp.ts,
        thread_ts: thread,
        broadcast: !!broadcast,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.error('Error sending Slack message', msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
