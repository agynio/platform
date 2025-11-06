import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { ReferenceFieldSchema, normalizeTokenRef, parseVaultRef, resolveTokenRef } from '../../../../utils/refs';
import { SendSlackMessageNode } from './send_slack_message.node';
import { SlackChannelAdapter, type SendResult } from '../../../../channels/slack.adapter';

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
    private adapter: SlackChannelAdapter,
  ) {
    super();
  }
  get name() {
    return 'send_slack_message';
  }
  get description() {
    return 'Send a Slack message (channel or DM). Supports thread replies, broadcast, ephemeral messages. Deprecated: prefer send_message.';
  }
  get schema() {
    return sendSlackInvocationSchema;
  }

  async execute(args: z.infer<typeof sendSlackInvocationSchema>): Promise<string> {
    const { channel: channelInput, text, thread_ts, broadcast, ephemeral_user } = args;
    this.logger.info('send_slack_message: deprecated; prefer send_message');
    const bot = normalizeTokenRef(this.node.config.bot_token) as TokenRef;
    if ((bot.source || 'static') === 'vault') parseVaultRef(bot.value);
    else if (!bot.value.startsWith('xoxb-')) throw new Error('Slack bot token must start with xoxb-');
    const channel = channelInput;
    if (!channel) throw new Error('channel is required');
    try {
      const token = await resolveTokenRef(bot, { expectedPrefix: 'xoxb-', fieldName: 'bot_token', vault: this.vault });
      // Delegate to adapter for consistent retries/error mapping, overriding token from legacy config
      const res: SendResult = await this.adapter.send(
        { type: 'slack', channel, thread_ts },
        { text, ephemeral_user, broadcast: !!broadcast },
        token,
      );
      if (!res.ok) return JSON.stringify({ ok: false, error: res.error });
      const ref = res.ref;
      return JSON.stringify({ ok: true, channel: ref?.channel, ts: ref?.ts, thread_ts: ref?.thread_ts, broadcast: !!broadcast, ephemeral: !!ephemeral_user });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || String(err);
      this.logger.error('Error sending Slack message', msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
