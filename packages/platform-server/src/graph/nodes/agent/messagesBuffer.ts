import { AIMessage, HumanMessage, SystemMessage } from '@agyn/llm';

export type BufferMessage = AIMessage | HumanMessage | SystemMessage;

export enum ProcessBuffer {
  OneByOne = 'oneByOne',
  AllTogether = 'allTogether',
}

export interface MessagesBufferOptions {
  debounceMs?: number;
}

type ThreadState = {
  queue: BufferMessage[];
  lastEnqueueAt: number;
};

/**
 * Single-queue, pull-based buffer owned by Agent.
 * External inputs are validated upstream; this buffer stores strictly typed messages.
 */
export class MessagesBuffer {
  private debounceMs: number;
  private threads: Map<string, ThreadState> = new Map();

  constructor(opts?: MessagesBufferOptions) {
    this.debounceMs = Math.max(0, opts?.debounceMs ?? 0);
  }

  setDebounceMs(ms: number) {
    this.debounceMs = Math.max(0, Math.trunc(ms));
  }

  enqueue(thread: string, msgs: BufferMessage[] | BufferMessage, now = Date.now()): void {
    const batch = Array.isArray(msgs) ? msgs : [msgs];
    if (batch.length === 0) return;
    const s = this.ensure(thread);
    s.queue.push(...batch);
    s.lastEnqueueAt = now;
  }

  hasPending(thread: string, now = Date.now()): boolean {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return false;
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return false;
    return s.queue.length > 0;
  }

  size(thread: string): number {
    const s = this.threads.get(thread);
    return s ? s.queue.length : 0;
  }

  drainAll(thread: string, maxBatchSize?: number, now = Date.now()): BufferMessage[] {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return [];
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return [];
    const n = typeof maxBatchSize === 'number' && maxBatchSize > 0 ? Math.min(maxBatchSize, s.queue.length) : s.queue.length;
    const out = s.queue.splice(0, n);
    return out;
  }

  drainOne(thread: string, now = Date.now()): BufferMessage[] {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return [];
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return [];
    const item = s.queue.shift();
    return item ? [item] : [];
  }

  nextReadyAt(thread: string, now = Date.now()): number | undefined {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return undefined;
    if (this.debounceMs === 0) return now;
    return s.lastEnqueueAt + this.debounceMs;
  }

  clearThread(thread: string): void {
    const s = this.threads.get(thread);
    if (!s) return;
    s.queue.length = 0;
    s.lastEnqueueAt = 0;
  }

  destroy(): void {
    this.threads.clear();
  }

  private ensure(thread: string): ThreadState {
    let s = this.threads.get(thread);
    if (!s) {
      s = { queue: [], lastEnqueueAt: 0 };
      this.threads.set(thread, s);
    }
    return s;
  }
}
