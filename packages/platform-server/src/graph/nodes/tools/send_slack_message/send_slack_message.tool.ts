import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { ReferenceFieldSchema } from '../../../../utils/refs';
import { SendSlackMessageNode } from './send_slack_message.node';
import { TriggerMessagingService } from '../../../../channels/trigger.messaging';
import { AgentsPersistenceService } from '../../../../agents/agents.persistence.service';
import type { SlackChannelInfo } from '../../../../channels/types';
import { LLMContext } from '../../../../llm/types';

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

export class SendSlackMessageFunctionTool extends FunctionTool<typeof sendSlackInvocationSchema> {
  constructor(
    private node: SendSlackMessageNode,
    private logger: LoggerService,
    private vault: VaultService,
    private persistence: AgentsPersistenceService,
    private triggers: TriggerMessagingService,
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

  async execute(args: z.infer<typeof sendSlackInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { channel: channelInput, text, thread_ts, broadcast, ephemeral_user } = args;
    this.logger.info('send_slack_message: deprecated; prefer send_message');
    const channel = channelInput;
    if (!channel) throw new Error('channel is required');
    try {
      const threadId: string | undefined = ctx.threadId;
      if (!threadId) return JSON.stringify({ ok: false, error: 'thread_context_required' });
      const info = await this.persistence.getThreadChannel(threadId);
      if (!info || info.type !== 'slack' || !info.meta?.triggerNodeId)
        return JSON.stringify({ ok: false, error: 'invalid_channel_info' });
      const messenger = this.triggers.resolve('slack', info.meta.triggerNodeId);
      if (!messenger) return JSON.stringify({ ok: false, error: 'trigger_not_available' });
      const channelInfo: SlackChannelInfo = {
        type: 'slack',
        channel,
        thread_ts: thread_ts ?? info.thread_ts,
        user: info.user,
        meta: info.meta,
      };
      const res = await messenger.send(channelInfo, {
        text,
        ephemeral_user,
        broadcast: !!broadcast,
      });
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
