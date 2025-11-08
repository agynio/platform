import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { PrismaService } from '../../../../core/services/prisma.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ChannelDescriptorSchema, type SendResult } from '../../../../messaging/types';
import { SlackAdapter } from '../../../../messaging/slack/slack.adapter';
import type { LLMContext } from '../../../../llm/types';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(
    private logger: LoggerService,
    private vault: VaultService,
    private prismaService: PrismaService,
    private config: ConfigService,
  ) {
    super();
  }

  get name() {
    return 'send_message';
  }
  get description() {
    return "Send a message to the thread's origin channel.";
  }
  get schema() {
    return sendMessageInvocationSchema;
  }

  async execute(args: z.infer<typeof sendMessageInvocationSchema>, ctx: LLMContext): Promise<string> {
    const threadId = ctx?.threadId;
    if (!threadId) return JSON.stringify({ ok: false, error: 'missing_thread_context' });
    const prisma = this.prismaService.getClient();
    const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { channel: true, channelVersion: true } });
    if (!thread || !thread.channel) {
      this.logger.error('SendMessage: missing descriptor for thread', { threadId });
      return JSON.stringify({ ok: false, error: 'missing_channel_descriptor' });
    }
    const parsed = ChannelDescriptorSchema.safeParse(thread.channel);
    if (!parsed.success) {
      this.logger.error('SendMessage: invalid descriptor', { threadId });
      return JSON.stringify({ ok: false, error: 'invalid_channel_descriptor' });
    }
    const descriptor = parsed.data;
    const adapterLogger = {
      info: (...args: unknown[]) => this.logger.info('send_message', args),
      error: (...args: unknown[]) => this.logger.error('send_message', args),
      debug: (...args: unknown[]) => this.logger.debug?.('send_message', args),
    };
    try {
      const adapter = new SlackAdapter({ logger: adapterLogger, vault: { getSecret: (ref) => this.vault.getSecret(ref) } });
      const res: SendResult = await adapter.sendText({ threadId, text: args.message, descriptor });
      return JSON.stringify(res);
    } catch (e) {
      let msg = 'unknown_error';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      this.logger.error('SendMessage: adapter failed', { threadId, error: msg });
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
