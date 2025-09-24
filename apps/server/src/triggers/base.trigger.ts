import type { Pausable, ProvisionStatus, Provisionable } from '../graph/capabilities';

export type TriggerMessage = { content: string; info: Record<string, unknown> };

export interface TriggerListener {
  invoke(thread: string, messages: TriggerMessage[]): Promise<any>;
}

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

interface ThreadState {
  buffer: TriggerMessage[]; // accumulated messages waiting to be flushed
  timer?: NodeJS.Timeout; // debounce timer
  busy: boolean; // whether a notify for this thread is currently running
  flushRequestedWhileBusy: boolean; // indicates a flush attempt happened while busy
}

export abstract class BaseTrigger implements Pausable, Provisionable {
  private listeners: TriggerListener[] = [];
  private readonly debounceMs: number;
  private readonly waitForBusy: boolean;
  // Per-thread state
  private threads: Map<string, ThreadState> = new Map();

  // Pausable implementation
  private _paused = false;

  // Provisionable implementation
  private _provStatus: ProvisionStatus = { state: 'not_ready' };
  private _provListeners: Array<(s: ProvisionStatus) => void> = [];
  private _provInFlight: Promise<void> | null = null;

  constructor(options?: BaseTriggerOptions) {
    this.debounceMs = options?.debounceMs ?? 0;
    this.waitForBusy = options?.waitForBusy ?? false;
  }

  async subscribe(listener: TriggerListener): Promise<void> {
    this.listeners.push(listener);
  }

  async unsubscribe(listener: TriggerListener): Promise<void> {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // Pausable
  pause(): void {
    this._paused = true;
  }
  resume(): void {
    this._paused = false;
  }
  isPaused(): boolean {
    return this._paused;
  }

  // Provisionable
  getProvisionStatus(): ProvisionStatus {
    return this._provStatus;
  }

  onProvisionStatusChange(listener: (s: ProvisionStatus) => void): () => void {
    this._provListeners.push(listener);
    return () => {
      this._provListeners = this._provListeners.filter((l) => l !== listener);
    };
  }

  protected setProvisionStatus(status: ProvisionStatus) {
    this._provStatus = status;
    for (const l of this._provListeners) {
      try {
        l(status);
      } catch {
        // ignore listener errors
      }
    }
  }

  async provision(): Promise<void> {
    // Idempotent: if already ready, no-op
    if (this._provStatus.state === 'ready') return;
    if (this._provInFlight) return this._provInFlight;
    this.setProvisionStatus({ state: 'provisioning' });
    this._provInFlight = (async () => {
      try {
        await this.doProvision();
        this.setProvisionStatus({ state: 'ready' });
      } catch (err) {
        this.setProvisionStatus({ state: 'error', details: err });
      } finally {
        this._provInFlight = null;
      }
    })();
    return this._provInFlight;
  }

  async deprovision(): Promise<void> {
    if (this._provStatus.state === 'not_ready') return;
    this.setProvisionStatus({ state: 'deprovisioning' });
    try {
      await this.doDeprovision();
    } finally {
      // Regardless of outcome, transition to not_ready as per spec
      this.setProvisionStatus({ state: 'not_ready' });
    }
  }

  /** Hooks for subclasses to implement actual resource lifecycle */
  protected async doProvision(): Promise<void> { /* no-op by default */ }
  protected async doDeprovision(): Promise<void> { /* no-op by default */ }

  /**
   * External triggers call this to enqueue new messages for a given thread.
   * Applies debounce and busy-wait logic per configuration.
   */
  protected async notify(thread: string, messages: TriggerMessage[]): Promise<void> {
    if (this._paused) return; // drop events while paused
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
      await Promise.all(this.listeners.map(async (listener) => listener.invoke(thread, batch)));
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

  // Universal teardown method for runtime disposal
  async destroy(): Promise<void> {
    // default: unsubscribe all listeners by clearing the array
    this.listeners = [];
    // clear timers
    for (const state of this.threads.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.threads.clear();
  }
}
