import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import type { LLMContext } from '../../../llm/types';
import { ThreadTransportService } from '../../../messaging/threadTransport.service';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(private readonly transport: ThreadTransportService) {
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
    if (!threadId) return 'missing_thread_context';
    try {
      const result = await this.transport.sendTextToThread(threadId, args.message, {
        runId: ctx?.runId,
        source: 'send_message',
      });
      if (result.ok) {
        return 'message sent successfully';
      }
      return result.error ?? 'unknown_error';
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      return msg;
    }
  }
}
