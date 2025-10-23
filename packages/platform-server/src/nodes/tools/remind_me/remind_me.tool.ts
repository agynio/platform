import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../../../core/services/logger.service';
import { LLMContext } from '../../../llm/types';

export const remindMeInvocationSchema = z
  .object({
    delayMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1000),
    note: z.string().min(1),
    parentThreadId: z.string().min(1).describe('Parent thread id for scheduling the reminder'),
  })
  .strict();

export const RemindMeToolStaticConfigSchema = z.object({}).strict();

type ActiveReminder = { id: string; threadId: string; note: string; at: string };

export class RemindMeFunctionTool extends FunctionTool<typeof remindMeInvocationSchema> {
  private active: Map<string, { timer: ReturnType<typeof setTimeout>; reminder: ActiveReminder }> = new Map();
  private destroyed = false;
  private maxActive = 1000;
  constructor(private logger: LoggerService) {
    super();
  }
  get name() {
    return 'remind_me';
  }
  get description() {
    return 'Schedule a reminder message after a delay (async fire-and-forget).';
  }
  get schema() {
    return remindMeInvocationSchema;
  }
  getActiveReminders(): ActiveReminder[] {
    return Array.from(this.active.values()).map((v) => v.reminder);
  }
  async destroy(): Promise<void> {
    this.destroyed = true;
    for (const rec of this.active.values()) clearTimeout(rec.timer);
    this.active.clear();
  }
  async execute(args: z.infer<typeof remindMeInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { delayMs, note, parentThreadId } = args;

    if (this.destroyed) throw new Error('RemindMe tool destroyed');
    if (this.active.size >= this.maxActive) throw new Error(`Too many active reminders (max ${this.maxActive})`);
    const boundedDelay = delayMs; // already clamped by schema max
    const eta = new Date(Date.now() + boundedDelay).toISOString();
    const id = `${parentThreadId}:${uuidv4()}`;
    const logger = this.logger;
    const timer = setTimeout(async () => {
      const exists = this.active.has(id);
      if (!exists) return;
      this.active.delete(id);
      try {
        await ctx.callerAgent.invoke(parentThreadId, [
          { kind: 'system', content: note, info: { reason: 'reminded' } },
        ] as any);
      } catch (e: any) {
        logger.error('RemindMe scheduled invoke error', e?.message || String(e));
      }
    }, boundedDelay);
    this.active.set(id, { timer, reminder: { id, threadId: parentThreadId, note, at: eta } });
    return JSON.stringify({ status: 'scheduled', etaMs: boundedDelay, at: eta, id });
  }
}
