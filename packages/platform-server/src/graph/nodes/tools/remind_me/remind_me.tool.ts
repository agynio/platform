import z from 'zod';
import { FunctionTool, SystemMessage } from '@agyn/llm';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../../../../core/services/logger.service';
import { PrismaService } from '../../../../core/services/prisma.service';
import type { Reminder } from '@prisma/client';
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

export class RemindMeFunctionTool extends FunctionTool<typeof remindMeInvocationSchema> {
  // Track DB reminder id -> timer + entity
  private active: Map<string, { timer: ReturnType<typeof setTimeout>; reminder: Reminder }> = new Map();
  private destroyed = false;
  private maxActive = 1000;
  private onRegistryChanged?: (count: number, updatedAtMs?: number, threadId?: string) => void;
  constructor(private logger: LoggerService, private prismaService: PrismaService) {
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
  getActiveReminders(): Reminder[] {
    return Array.from(this.active.values()).map((v) => v.reminder);
  }
  /**
   * Register a callback invoked whenever the active reminders registry size changes.
   * Used to emit socket updates without coupling the tool to gateway implementation.
   */
  setOnRegistryChanged(cb?: (count: number, updatedAtMs?: number, threadId?: string) => void) {
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

    const etaDate = new Date(Date.now() + delayMs);
    const eta = etaDate.toISOString();
    const logger = this.logger;
    const prisma = this.prismaService.getClient();
    // Create DB row first; id is UUID
    const created = await prisma.reminder.create({
      data: { id: uuidv4(), threadId, note, at: etaDate, completedAt: null },
    });
    const timer = setTimeout(async () => {
      const exists = this.active.has(created.id);
      if (!exists) return;
      // Mark persisted reminder as completed with localized error handling
      try {
        await prisma.reminder.update({ where: { id: created.id }, data: { completedAt: new Date() } });
      } catch (e) {
        logger.error('RemindMe completion failed', e);
      } finally {
        // Always remove from registry and notify
        this.active.delete(created.id);
        this.onRegistryChanged?.(this.active.size, undefined, created.threadId);
      }
      try {
        const msg = SystemMessage.fromText(`Reminder: ${note}`);
        await ctx.callerAgent.invoke(threadId, [msg]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        logger.error('RemindMe scheduled invoke error', msg);
      }
    }, delayMs);
    // Store created entity in registry keyed by DB id
    this.active.set(created.id, { timer, reminder: created });
    // Registry size increased; notify (include threadId)
    this.onRegistryChanged?.(this.active.size, undefined, threadId);
    // Return ack including DB id
    return JSON.stringify({ status: 'scheduled', etaMs: delayMs, at: eta, id: created.id });
  }
}
