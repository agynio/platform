import z from 'zod';
import { FunctionTool } from '@agyn/llm';
import { Logger } from '@nestjs/common';
import type { ThreadOutboxSource } from '../../../messaging/types';
import { ThreadOutboxService } from '../../../messaging/threadOutbox.service';
import type { LLMContext } from '../../../llm/types';

export const sendMessageInvocationSchema = z.object({ message: z.string().min(1).describe('Message text.') }).strict();

export class SendMessageFunctionTool extends FunctionTool<typeof sendMessageInvocationSchema> {
  private readonly logger = new Logger(SendMessageFunctionTool.name);

  constructor(private readonly outbox: ThreadOutboxService) {
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
    const runId = ctx?.runId ?? null;
    if (!threadId) {
      return JSON.stringify({ ok: false, error: 'missing_thread_context' });
    }

    const message = args.message?.trim() ?? '';
    if (!message) {
      return JSON.stringify({ ok: false, error: 'empty_message' });
    }

    try {
      const res = await this.outbox.send({
        threadId,
        text: message,
        source: 'send_message' satisfies ThreadOutboxSource,
        runId,
      });
      return JSON.stringify(res);
    } catch (error) {
      this.logger.error(
        `SendMessageFunctionTool: outbox send failed${this.format({
          threadId,
          runId,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error },
        })}`,
      );
      const msg = error instanceof Error && error.message ? error.message : 'unknown_error';
      return JSON.stringify({ ok: false, error: msg });
    }
  }
}
