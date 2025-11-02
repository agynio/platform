import z from 'zod';

import { FunctionTool, HumanMessage } from '@agyn/llm';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../../../../core/services/logger.service';
import { LLMContext } from '../../../../llm/types';

export const remindMeInvocationSchema = z
  .object({
    delayMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1000),
    note: z.string().min(1),
  })
  .strict();

export const RemindMeToolStaticConfigSchema = z.object({}).strict();

export type ActiveReminder = { id: string; threadId: string; note: string; at: string };

export class RemindMeFunctionTool extends FunctionTool<typeof remindMeInvocationSchema> {
  private active: Map<string, { timer: ReturnType<typeof setTimeout>; reminder: ActiveReminder }> = new Map();
  private destroyed = false;
  private maxActive = 1000;
  private onRegistryChanged?: (count: number, updatedAtMs?: number) => void;
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
  /**
   * Register a callback invoked whenever the active reminders registry size changes.
   * Used to emit socket updates without coupling the tool to gateway implementation.
   */
  setOnRegistryChanged(cb?: (count: number, updatedAtMs?: number) => void) {
    this.onRegistryChanged = cb;
  }
  async destroy(): Promise<void> {
    this.destroyed = true;
    for (const rec of this.active.values()) clearTimeout(rec.timer);
    this.active.clear();
    // Emit registry size change (count=0) after destroy
    this.onRegistryChanged?.(0);
  }
  async execute(args: z.infer<typeof remindMeInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { delayMs, note } = args;
    const { threadId } = ctx;

    if (this.destroyed) throw new Error('RemindMe tool destroyed');
    if (this.active.size >= this.maxActive) throw new Error(`Too many active reminders (max ${this.maxActive})`);

    const eta = new Date(Date.now() + delayMs).toISOString();
    const id = `${threadId}:${uuidv4()}`;
    const logger = this.logger;
    const timer = setTimeout(async () => {
      const exists = this.active.has(id);
      if (!exists) return;
      this.active.delete(id);
      // Registry size decreased; notify
      try {
        this.onRegistryChanged?.(this.active.size);
      } catch {}
      try {
        const msg = HumanMessage.fromText(`Reminder: ${note}`);
        await ctx.callerAgent.invoke(threadId, [msg]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        logger.error('RemindMe scheduled invoke error', msg);
      }
    }, delayMs);
    this.active.set(id, { timer, reminder: { id, threadId: threadId, note, at: eta } });
    // Registry size increased; notify
    try {
      this.onRegistryChanged?.(this.active.size);
    } catch {}
    return JSON.stringify({ status: 'scheduled', etaMs: delayMs, at: eta, id });
  }
}
