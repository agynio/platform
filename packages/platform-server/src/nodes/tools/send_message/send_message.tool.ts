import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import type { SendResult } from '../../../messaging/types';
import type { LLMContext } from '../../../llm/types';
import { PrismaService } from '../../../core/services/prisma.service';
import { LiveGraphRuntime } from '../../../graph-core/liveGraph.manager';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(
    private logger: LoggerService,
    private prisma: PrismaService,
    private runtime: LiveGraphRuntime,
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
    try {
      const prisma = this.prisma.getClient();
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { triggerNodeId: true },
      });
      const triggerNodeId = thread?.triggerNodeId ?? null;
      if (!triggerNodeId) {
        return JSON.stringify({ ok: false, error: 'missing_trigger_node' });
      }
      const node = this.runtime.getNodeInstance(triggerNodeId);
      if (!node) {
        return JSON.stringify({ ok: false, error: 'trigger_node_unavailable' });
      }
      if (!(node instanceof SlackTrigger)) {
        this.logger.error('SendMessageFunctionTool: trigger node is not SlackTrigger', { threadId, triggerNodeId });
        return JSON.stringify({ ok: false, error: 'invalid_trigger_type' });
      }
      if (node.status !== 'ready') {
        return JSON.stringify({ ok: false, error: 'slacktrigger_unprovisioned' });
      }
      const res: SendResult = await node.sendToChannel(threadId, args.message);
      return JSON.stringify(res);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
