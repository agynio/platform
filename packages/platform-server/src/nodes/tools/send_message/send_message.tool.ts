import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import { EventsBusService } from '../../../events/events-bus.service';
import type { LLMContext } from '../../../llm/types';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  constructor(
    private logger: LoggerService,
    private eventsBus: EventsBusService,
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
      this.eventsBus.emitSlackSendRequested({ threadId, text: args.message });
      return JSON.stringify({ ok: true, status: 'queued' });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      this.logger.error('SendMessageFunctionTool.emitSlackSendRequested failed', { threadId, error: msg });
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
