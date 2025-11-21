import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import { SendResultSchema } from '../../../messaging/types';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';
import type { LLMContext } from '../../../llm/types';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(
    private logger: LoggerService,
    private trigger: SlackTrigger,
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
      const result = (await this.trigger.sendToThread(threadId, args.message)) as unknown;
      const parsed = SendResultSchema.safeParse(result);
      if (!parsed.success) {
        this.logger.error('SendMessageFunctionTool invalid send result', { threadId, result });
        return JSON.stringify({ ok: false, error: 'tool_invalid_response' });
      }
      return JSON.stringify(parsed.data);
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error('SendMessageFunctionTool execute failed', e, { threadId });
        const message = e.message ? e.message : 'unknown_error';
        return JSON.stringify({ ok: false, error: message });
      }
      this.logger.error('SendMessageFunctionTool execute failed', { threadId, error: e });
      return JSON.stringify({ ok: false, error: 'unknown_error' });
    }
  }
}
