import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import type { SendResult } from '../../../messaging/types';
import { SlackTrigger } from '../../slackTrigger/slackTrigger.node';
import type { LLMContext } from '../../../llm/types';
import { normalizeError } from '../../../messaging/error.util';

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
      if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean') {
        this.logger.error('SendMessageFunctionTool.execute received invalid response', {
          threadId,
          responseType: res === null ? 'null' : typeof res,
          hasOk: res && typeof (res as { ok?: unknown }).ok !== 'undefined',
        });
        const fallback: SendResult = { ok: false, error: 'send_message_invalid_response' };
        return JSON.stringify(fallback);
      }
      return JSON.stringify(res);
    } catch (e) {
      const normalized = normalizeError(e);
      this.logger.error('SendMessageFunctionTool.execute failed', {
        threadId,
        error: normalized.message,
        details: normalized.details,
      });
      const result: SendResult = { ok: false, error: normalized.message };
      if (normalized.details) result.details = normalized.details;
      return JSON.stringify(result);
    }
  }
}
