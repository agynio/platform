import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { ReferenceFieldSchema, resolveTokenRef, type ReferenceValue } from '../../../../utils/refs';
import { SendSlackMessageNode } from './send_slack_message.node';
import { AgentsPersistenceService } from '../../../../agents/agents.persistence.service';
import type { SlackChannelInfo } from '../../../../channels/types';
import { LLMContext } from '../../../../llm/types';
import { SlackChannelAdapter } from '../../../../channels/slack.adapter';

export const SendSlackMessageToolStaticConfigSchema = z
  .object({
    // Optional to allow env fallback for legacy nodes
    bot_token: z
      .union([
        z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
        ReferenceFieldSchema,
      ])
      .optional(),
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
      if (!info || info.type !== 'slack') return JSON.stringify({ ok: false, error: 'invalid_channel_info' });

      // Resolve token: prefer node config; fallback to env SLACK_BOT_TOKEN
      const cfg = this.node.config as z.infer<typeof SendSlackMessageToolStaticConfigSchema>;
      const cfgToken = cfg?.bot_token;
      const normalizeStrict = (input: string | ReferenceValue): ReferenceValue => {
        if (typeof input === 'string') return { value: input, source: 'static' } as const;
        return { value: input.value, source: input.source || 'static' } as const;
      };
      let token: string | undefined;
      if (cfgToken) {
        const ref = normalizeStrict(cfgToken);
        token = await resolveTokenRef(ref, { expectedPrefix: 'xoxb-', fieldName: 'bot_token', vault: this.vault });
      } else if (process.env.SLACK_BOT_TOKEN) {
        const ref = { value: String(process.env.SLACK_BOT_TOKEN), source: 'static' as const };
        token = await resolveTokenRef(ref, { expectedPrefix: 'xoxb-', fieldName: 'bot_token', vault: this.vault });
      }
      if (!token) return JSON.stringify({ ok: false, error: 'bot_token_missing' });

      const adapter = new SlackChannelAdapter(this.logger);
      const channelInfo: SlackChannelInfo = {
        type: 'slack',
        channel,
        thread_ts: thread_ts ?? info.thread_ts,
        user: info.user,
      };
      const res = await adapter.send(channelInfo, { text, ephemeral_user, broadcast: !!broadcast }, token);
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
