import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import { isSendResult, type SendResult } from '../../../messaging/types';
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
      const res: SendResult = await this.trigger.sendToThread(threadId, args.message);
      if (!isSendResult(res)) {
        this.logger.error('SendMessageFunctionTool.execute: trigger returned invalid response', { threadId });
        return JSON.stringify({ ok: false, error: 'tool_invalid_response' });
      }
      return JSON.stringify(res);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : String(e);
      this.logger.error('SendMessageFunctionTool.execute: unexpected error', { threadId, error: msg });
      return JSON.stringify({ ok: false, error: 'tool_execution_error' });
    }
  }
}
