import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../vault/vault.service';
import { ReferenceFieldSchema, normalizeTokenRef, parseVaultRef, resolveTokenRef } from '../../../utils/refs';
import { SendSlackMessageNode } from './send_slack_message.node';

export const SendSlackMessageToolStaticConfigSchema = z
  .object({
    bot_token: z.union([
      z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
      ReferenceFieldSchema,
    ]),
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

export class SendSlackMessageFunctionTool extends FunctionTool<typeof sendSlackInvocationSchema> {
  constructor(
    private node: SendSlackMessageNode,
    private logger: LoggerService,
    private vault: VaultService,
  ) {
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

    const bot = normalizeTokenRef(this.node.config.bot_token) as TokenRef;
    if ((bot.source || 'static') === 'vault') parseVaultRef(bot.value);
    else if (!bot.value.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
    const channel = channelInput;
    if (!channel) throw new Error('channel is required');
    try {
      const token = await resolveTokenRef(bot, {
        expectedPrefix: 'xoxb-',
        fieldName: 'bot_token',
        vault: this.vault,
      });
      const client = new WebClient(token, { logLevel: undefined });
      if (ephemeral_user) {
        const respRaw: unknown = await client.chat.postEphemeral({
          channel,
          user: ephemeral_user,
          text,
        });
        if (!respRaw || typeof respRaw !== 'object' || typeof (respRaw as { ok?: unknown }).ok !== 'boolean') {
          this.logger.error('SendSlackMessageFunctionTool: invalid Slack ephemeral response', {
            channel,
            ephemeral_user,
          });
          return JSON.stringify({ ok: false, error: 'slack_api_invalid_response' });
        }
        const resp = respRaw as ChatPostEphemeralResponse;
        if (!resp.ok) {
          const err = typeof resp.error === 'string' && resp.error.trim() ? resp.error : 'slack_api_invalid_response';
          return JSON.stringify({ ok: false, error: err });
        }
        return JSON.stringify({ ok: true, channel, message_ts: resp.message_ts, ephemeral: true });
      }
      const respRaw: unknown = await client.chat.postMessage({
        channel,
        text,
        attachments: [],
        ...(thread_ts ? { thread_ts } : {}),
      });
      if (!respRaw || typeof respRaw !== 'object' || typeof (respRaw as { ok?: unknown }).ok !== 'boolean') {
        this.logger.error('SendSlackMessageFunctionTool: invalid Slack response', {
          channel,
          thread_ts,
        });
        return JSON.stringify({ ok: false, error: 'slack_api_invalid_response' });
      }
      const resp = respRaw as ChatPostMessageResponse;
      if (!resp.ok) {
        const err = typeof resp.error === 'string' && resp.error.trim() ? resp.error : 'slack_api_invalid_response';
        return JSON.stringify({ ok: false, error: err });
      }
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
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || String(err);
      this.logger.error('Error sending Slack message', msg);
      return JSON.stringify({ ok: false, error: 'tool_execution_error' });
    }
  }
}
