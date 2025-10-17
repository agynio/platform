import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import { v4 as uuidv4 } from 'uuid';

const remindMeSchema = z.object({ delayMs: z.number().int().min(0), note: z.string().min(1) });
const MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days safety cap

// Minimal interface for the caller agent used by this tool
interface CallerAgentLike {
  invoke(thread: string, messages: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>): Promise<unknown>;
}

export type ActiveReminder = { id: string; threadId: string; note: string; at: string };
// Minimal interface for inspection without importing the class
export interface RemindMeInspectable {
  getActiveReminders(): ActiveReminder[];
}

export class RemindMeTool extends BaseTool {
  // In-memory registry of scheduled (not-yet-fired) reminders
  private active: Map<string, { timer: ReturnType<typeof setTimeout>; reminder: ActiveReminder }> = new Map();
  private destroyed = false;
  private maxActive = 1000; // soft cap on simultaneously scheduled reminders

  constructor(private logger: LoggerService) {
    super();
  }

  // Expose active reminders for UI via HTTP route
  getActiveReminders(): ActiveReminder[] {
    return Array.from(this.active.values()).map((v) => v.reminder);
  }

  // Teardown: cancel timers and clear registry
  async destroy(): Promise<void> {
    this.destroyed = true;
    for (const [id, rec] of Array.from(this.active.entries())) {
      try { clearTimeout(rec.timer); } catch {}
      this.active.delete(id);
    }
  }

  init(): DynamicStructuredTool {
    return tool(
      async (raw, config) => {
        const { delayMs, note } = remindMeSchema.parse(raw);
        // Clamp excessive delays to avoid long-lived timers retaining memory
        const boundedDelay = Math.min(delayMs, MAX_DELAY_MS);
        // Guarded extraction of configurable context
        const cfg = (config && typeof config === 'object'
          ? (config as Record<string, unknown>).configurable
          : undefined) as Record<string, unknown> | undefined;

        // Narrow thread id from generic configurable bag
        const threadId = (() => {
          const v = cfg?.['thread_id'];
          return typeof v === 'string' ? v : undefined;
        })();

        // Type guard for caller agent shape
        const maybeCaller = cfg?.['caller_agent'] as unknown;
        const callerAgent = isCallerAgentLike(maybeCaller) ? maybeCaller : undefined;

        if (!threadId) {
          const msg = 'RemindMeTool error: missing thread_id in runtime config.';
          this.logger.error(msg);
          return msg;
        }
        if (!callerAgent || typeof callerAgent.invoke !== 'function') {
          const msg = 'RemindMeTool error: missing caller_agent in runtime config.';
          this.logger.error(msg);
          return msg;
        }

        // Enforce lifecycle and capacity
        if (this.destroyed) {
          const msg = 'RemindMeTool is destroyed; cannot schedule.';
          this.logger.error(msg);
          throw new Error(msg);
        }
        if (this.active.size >= this.maxActive) {
          const msg = `Too many active reminders (max ${this.maxActive}).`;
          this.logger.error(msg);
          // Throw to mark tool call as error (ToolsNode maps exceptions to error ToolMessage)
          throw new Error(msg);
        }

        // Schedule async reminder; track in in-memory registry until fired.
        const eta = new Date(Date.now() + boundedDelay).toISOString();
        const id = `${threadId}:${uuidv4()}`;
        const timer = setTimeout(async () => {
          // If removed (e.g., via destroy), do nothing
          const exists = this.active.has(id);
          if (!exists) return;
          // Remove first to avoid double-removal in race scenarios
          this.active.delete(id);
          try {
            await callerAgent.invoke(threadId, [
              { kind: 'system', content: note, info: { reason: 'reminded' } },
            ]);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error');
            this.logger.error('RemindMeTool scheduled invoke error', err);
          }
        }, boundedDelay);

        // Add to registry immediately
        this.active.set(id, { timer, reminder: { id, threadId, note, at: eta } });

        return { status: 'scheduled', etaMs: boundedDelay, at: eta };
      },
      {
        name: 'remindMeTool',
        description:
          'Schedule a reminder message to self after a delay. Useful for time-based follow-ups. Async-only; returns immediately with schedule info.',
        schema: remindMeSchema,
      },
    );
  }
}

export const RemindMeToolStaticConfigSchema = z.object({}).strict();

// Runtime type guard to ensure the caller comes with an invoke function
function isCallerAgentLike(x: unknown): x is CallerAgentLike {
  return !!(
    x &&
    typeof x === 'object' &&
    'invoke' in (x as object) &&
    typeof (x as { invoke?: unknown }).invoke === 'function'
  );
}
