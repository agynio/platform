import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { WebClient, type ChatPostEphemeralResponse, type ChatPostMessageResponse } from '@slack/web-api';
import { LoggerService } from '../../../core/services/logger.service';
import { SecretReferenceSchema, VariableReferenceSchema } from '../../../utils/reference-schemas';
import { SendSlackMessageNode } from './send_slack_message.node';

export const SendSlackMessageToolStaticConfigSchema = z
  .object({
    bot_token: z.union([
      z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
      SecretReferenceSchema,
      VariableReferenceSchema,
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

export class SendSlackMessageFunctionTool extends FunctionTool<typeof sendSlackInvocationSchema> {
  constructor(
    private node: SendSlackMessageNode,
    private logger: LoggerService,
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

    const botToken = this.node.config.bot_token;
    if (typeof botToken !== 'string' || !botToken.startsWith('xoxb-')) {
      throw new Error('Slack bot token must start with xoxb-');
    }
    const channel = channelInput;
    if (!channel) throw new Error('channel is required');
    try {
      const client = new WebClient(botToken, { logLevel: undefined });
      if (ephemeral_user) {
        const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({
          channel,
          user: ephemeral_user,
          text,
        });
        if (!resp.ok) return JSON.stringify({ ok: false, error: resp.error });
        return JSON.stringify({ ok: true, channel, message_ts: resp.message_ts, ephemeral: true });
      }
      const resp: ChatPostMessageResponse = await client.chat.postMessage({
        channel,
        text,
        attachments: [],
        ...(thread_ts ? { thread_ts } : {}),
      });
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
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || String(err);
      this.logger.error('Error sending Slack message', msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
