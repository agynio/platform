export type TriggerMessage = { content: string; info: Record<string, unknown> };

/**
 * Behavior configuration for triggers.
 *
 * debounceMs: (default 0) If > 0, messages for the same thread are buffered and delivered
 *             after there have been no new messages for that thread for the specified ms.
 * waitForBusy: (default false) If true, and any listener is still processing a previous
 *              notification for the thread, new messages accumulate (are merged into the
 *              pending buffer) and are sent immediately once the previous processing
 *              completes (still respecting debounce if configured).
 */
export interface BaseTriggerOptions {
  debounceMs?: number;
  waitForBusy?: boolean;
}

type Listener = (thread: string, messages: TriggerMessage[]) => Promise<void>;

interface ThreadState {
  buffer: TriggerMessage[]; // accumulated messages waiting to be flushed
  timer?: NodeJS.Timeout; // debounce timer
  busy: boolean; // whether a notify for this thread is currently running
  flushRequestedWhileBusy: boolean; // indicates a flush attempt happened while busy
}

export abstract class BaseTrigger {
  private listeners: Listener[] = [];
  private readonly debounceMs: number;
  private readonly waitForBusy: boolean;
  // Per-thread state
  private threads: Map<string, ThreadState> = new Map();

  constructor(options?: BaseTriggerOptions) {
    this.debounceMs = options?.debounceMs ?? 0;
    this.waitForBusy = options?.waitForBusy ?? false;
  }

  async subscribe(callback: Listener): Promise<void> {
    this.listeners.push(callback);
  }

  /**
   * External triggers call this to enqueue new messages for a given thread.
   * Applies debounce and busy-wait logic per configuration.
   */
  protected async notify(thread: string, messages: TriggerMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const state = this.ensureThreadState(thread);
    // Append messages to buffer
    state.buffer.push(...messages);

    if (this.waitForBusy && state.busy) {
      // Busy: mark that after current run we should flush again (debounce still applies)
      state.flushRequestedWhileBusy = true;
      return; // Do not start new timer here; existing debounce (if any) will cover, else we flush after busy finishes
    }

    if (this.debounceMs > 0) {
      // Reset debounce timer
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        this.flushThread(thread).catch(() => {
          /* errors logged inside flush */
        });
      }, this.debounceMs);
    } else {
      // Immediate flush (unless busy-wait prevented above)
      await this.flushThread(thread);
    }
  }

  private ensureThreadState(thread: string): ThreadState {
    let s = this.threads.get(thread);
    if (!s) {
      s = { buffer: [], busy: false, flushRequestedWhileBusy: false };
      this.threads.set(thread, s);
    }
    return s;
  }

  private async flushThread(thread: string): Promise<void> {
    const state = this.ensureThreadState(thread);
    if (state.busy) {
      // If we're not configured to wait for busy, this situation occurs only if debounce fired while busy.
      // In waitForBusy mode we mark intention to flush afterwards.
      if (this.waitForBusy) {
        state.flushRequestedWhileBusy = true;
        return;
      }
    }
    if (state.buffer.length === 0) return;
    // Extract messages to send
    const batch = state.buffer.slice();
    state.buffer = [];
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    state.busy = true;
    try {
      await Promise.all(
        this.listeners.map(async (listener) => {
          await listener(thread, batch);
        }),
      );
    } finally {
      state.busy = false;
      // If additional messages arrived while busy, decide whether to flush now or debounce again
      if (state.flushRequestedWhileBusy && state.buffer.length > 0) {
        state.flushRequestedWhileBusy = false;
        if (this.debounceMs > 0) {
          // Start (or restart) debounce for the new buffer set
          if (state.timer) clearTimeout(state.timer);
          state.timer = setTimeout(() => {
            this.flushThread(thread).catch(() => {
              /* errors logged inside flush */
            });
          }, this.debounceMs);
        } else {
          // Immediate flush
          await this.flushThread(thread);
        }
      } else {
        state.flushRequestedWhileBusy = false;
      }
    }
  }
}
