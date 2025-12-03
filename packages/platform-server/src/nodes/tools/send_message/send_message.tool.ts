import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { Logger } from '@nestjs/common';
import type { SendResult } from '../../../messaging/types';
import type { LLMContext } from '../../../llm/types';
import { PrismaService } from '../../../core/services/prisma.service';
import { LiveGraphRuntime } from '../../../graph-core/liveGraph.manager';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  private readonly logger = new Logger(SendMessageFunctionTool.name);
  constructor(
    private prisma: PrismaService,
    private runtime: LiveGraphRuntime,
  ) {
    super();
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
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
    if (!threadId) return 'missing_thread_context';
    try {
      const prisma = this.prisma.getClient();
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { channelNodeId: true },
      });
      const channelNodeId = thread?.channelNodeId ?? null;
      if (!channelNodeId) {
        return 'missing_channel_node';
      }
      const node = this.runtime.getNodeInstance(channelNodeId);
      if (!node) {
        return 'channel_node_unavailable';
      }
      if (!(node instanceof SlackTrigger)) {
        this.logger.error(
          `SendMessageFunctionTool: channel node is not SlackTrigger${this.format({ threadId, channelNodeId })}`,
        );
        return 'invalid_channel_type';
      }
      if (node.status !== 'ready') {
        return 'slacktrigger_unprovisioned';
      }
      const res: SendResult = await node.sendToChannel(threadId, args.message);
      if (res.ok) {
        return 'message sent successfully';
      }
      return res.error ?? 'unknown_error';
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return msg;
    }
  }
}
