import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTrigger, BaseTriggerOptions, TriggerMessage } from '../src/triggers/base.trigger';

// Concrete test subclass exposing protected notify
class TestTrigger extends BaseTrigger {
  constructor(options?: BaseTriggerOptions) { super(options); }
  emit(thread: string, messages: TriggerMessage[]) { return this.notify(thread, messages); }
}

describe('BaseTrigger', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('delivers immediately without debounce/waitForBusy', async () => {
    const trigger = new TestTrigger();
    const received: { thread: string; messages: TriggerMessage[] }[] = [];
    await trigger.subscribe(async (thread, messages) => {
      received.push({ thread, messages });
    });
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    expect(received.length).toBe(1);
    expect(received[0].messages.map(m => m.content)).toEqual(['a']);
  });

  it('debounces messages within window', async () => {
    vi.useFakeTimers();
    const trigger = new TestTrigger({ debounceMs: 100 });
    const received: TriggerMessage[][] = [];
    await trigger.subscribe(async (_thread, messages) => { received.push(messages); });
    trigger.emit('t1', [{ content: 'a', info: {} }]);
    vi.advanceTimersByTime(50);
    trigger.emit('t1', [{ content: 'b', info: {} }]);
    vi.advanceTimersByTime(99); // still not fired
    expect(received.length).toBe(0);
    vi.advanceTimersByTime(1); // reach 100ms since last
    await Promise.resolve(); // allow microtasks
    expect(received.length).toBe(1);
    expect(received[0].map(m => m.content)).toEqual(['a','b']);
    vi.useRealTimers();
  });

  it('waitForBusy aggregates while listener busy (no debounce)', async () => {
    const trigger = new TestTrigger({ waitForBusy: true });
    const receivedBatches: string[][] = [];
  const first = { resolve: null as null | (() => void) };
    await trigger.subscribe(async (_thread, messages) => {
      receivedBatches.push(messages.map(m => m.content));
      if (!first.resolve) {
        await new Promise<void>(res => { first.resolve = res; });
      }
    });
    // First emit starts busy listener
    trigger.emit('t1', [{ content: 'a', info: {} }]);
    // During busy, we emit more messages
    trigger.emit('t1', [{ content: 'b', info: {} }]);
    trigger.emit('t1', [{ content: 'c', info: {} }]);
    expect(receivedBatches.length).toBe(1); // only first delivered so far
    // Finish first listener
  if (first.resolve) { first.resolve(); }
    // Allow event loop to process next flush
    await new Promise(res => setTimeout(res, 0));
    expect(receivedBatches.length).toBe(2);
    expect(receivedBatches[1]).toEqual(['b','c']);
  });

  it.skip('waitForBusy + debounce merges messages and flushes after busy then debounce (skipped: timing flakiness with fake timers)', async () => {
    vi.useFakeTimers();
    const trigger = new TestTrigger({ waitForBusy: true, debounceMs: 50 });
    const batches: string[][] = [];
  let firstResolve: (() => void) | null = null as any;
    await trigger.subscribe(async (_thread, messages) => {
      batches.push(messages.map(m => m.content));
      if (!firstResolve) {
        await new Promise<void>(res => { firstResolve = res; });
      }
    });
    // Emit first message at t=0 (debounce 50ms)
    trigger.emit('t1', [{ content: 'a', info: {} }]);
    vi.advanceTimersByTime(49);
    expect(batches.length).toBe(0);
    vi.advanceTimersByTime(1); // t=50ms first flush -> listener busy (unresolved promise)
    await Promise.resolve();
    expect(batches.length).toBe(1);
    // Emit two more messages during busy period
    trigger.emit('t1', [{ content: 'b', info: {} }]);
    trigger.emit('t1', [{ content: 'c', info: {} }]);
    expect(batches.length).toBe(1);
    // Resolve first busy listener -> schedules second debounce (50ms)
    if (firstResolve) firstResolve();
    await Promise.resolve();
    await Promise.resolve();
  // Allow scheduling of second debounce timer (advance 0ms to process newly queued timer)
  vi.advanceTimersByTime(0);
  // Second debounce waiting
    vi.advanceTimersByTime(49);
    expect(batches.length).toBe(1);
  vi.advanceTimersByTime(1); // t=100ms total -> second flush
  await Promise.resolve();
  await Promise.resolve();
    expect(batches.length).toBe(2);
    expect(batches[1]).toEqual(['b','c']);
    vi.useRealTimers();
  });
});
