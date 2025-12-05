import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage, SystemMessage } from '@agyn/llm';

export type BufferMessage = AIMessage | HumanMessage | SystemMessage;

export enum ProcessBuffer {
  OneByOne = 'oneByOne',
  AllTogether = 'allTogether',
}

export interface MessagesBufferOptions {
  debounceMs?: number;
}

type QueuedItem = { id: string; msg: BufferMessage; tokenId?: string; ts: number };

type ThreadState = {
  queue: QueuedItem[];
  lastEnqueueAt: number;
};

/**
 * Pull-based buffer owned by Agent. Triggers enqueue, Agent drains.
 */
export class MessagesBuffer {
  private debounceMs: number;
  private threads: Map<string, ThreadState> = new Map();

  constructor(opts?: MessagesBufferOptions) {
    this.debounceMs = Math.max(0, opts?.debounceMs ?? 0);
  }

  setDebounceMs(ms: number) {
    // Use Math.trunc to avoid bitwise coercion pitfalls and preserve large values
    this.debounceMs = Math.max(0, Math.trunc(ms));
  }

  enqueue(thread: string, msgs: BufferMessage[], now = Date.now()): void {
    // Backwards-compatible helper: enqueues messages without token association.
    const batch = Array.isArray(msgs) ? msgs : [msgs];
    if (!batch.length) return;
    const s = this.ensure(thread);
    s.queue.push(...batch.map((m) => this.toQueuedItem(m, now)));
    s.lastEnqueueAt = now;
  }

  enqueueWithToken(thread: string, tokenId: string, msgs: BufferMessage[] | BufferMessage, now = Date.now()): void {
    const batch = Array.isArray(msgs) ? msgs : [msgs];
    if (!batch.length) return;
    const s = this.ensure(thread);
    s.queue.push(...batch.map((m) => this.toQueuedItem(m, now, tokenId)));
    s.lastEnqueueAt = now;
  }

  tryDrain(thread: string, mode: ProcessBuffer, now = Date.now()): BufferMessage[] {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return [];
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return [];
    if (mode === ProcessBuffer.AllTogether) {
      const out = s.queue.slice();
      s.queue.length = 0;
      return out.map((q) => q.msg);
    } else {
      const item = s.queue.shift()!;
      return [item.msg];
    }
  }

  tryDrainDescriptor(
    thread: string,
    mode: ProcessBuffer,
    now = Date.now(),
  ): { messages: BufferMessage[]; tokenParts: { tokenId: string; count: number }[] } {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return { messages: [], tokenParts: [] };
    if (this.debounceMs > 0 && now - s.lastEnqueueAt < this.debounceMs) return { messages: [], tokenParts: [] };
    const consumed: QueuedItem[] = [];
    if (mode === ProcessBuffer.AllTogether) {
      consumed.push(...s.queue);
      s.queue.length = 0;
    } else {
      consumed.push(s.queue.shift()!);
    }
    const messages = consumed.map((q) => q.msg);
    const partsMap = new Map<string, number>();
    for (const q of consumed) {
      if (!q.tokenId) continue;
      partsMap.set(q.tokenId, (partsMap.get(q.tokenId) || 0) + 1);
    }
    const tokenParts = Array.from(partsMap.entries()).map(([tokenId, count]) => ({ tokenId, count }));
    return { messages, tokenParts };
  }

  nextReadyAt(thread: string, now = Date.now()): number | undefined {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return undefined;
    if (this.debounceMs === 0) return now;
    return s.lastEnqueueAt + this.debounceMs;
  }

  /** Clear queued items for a thread. */
  clearThread(thread: string): void {
    const s = this.threads.get(thread);
    if (!s) return;
    s.queue.length = 0;
    s.lastEnqueueAt = 0;
  }

  destroy(): void {
    this.threads.clear();
  }

  dropTokens(thread: string, tokenIds: string[]): void {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return;
    const drop = new Set(tokenIds);
    s.queue = s.queue.filter((q) => !q.tokenId || !drop.has(q.tokenId));
  }

  snapshot(thread: string): Array<{ id: string; text: string; ts: number }> {
    const s = this.threads.get(thread);
    if (!s || s.queue.length === 0) return [];
    return s.queue.map((item) => ({ id: item.id, text: this.describeMessage(item.msg), ts: item.ts }));
  }

  private toQueuedItem(msg: BufferMessage, now: number, tokenId?: string): QueuedItem {
    return {
      id: randomUUID(),
      msg,
      tokenId,
      ts: now,
    };
  }

  private describeMessage(message: BufferMessage): string {
    if (message instanceof HumanMessage) {
      return typeof message.text === 'string' ? message.text : '';
    }
    return '';
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
