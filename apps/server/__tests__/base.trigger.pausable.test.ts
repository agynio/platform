import { describe, it, expect, vi } from 'vitest';
import { BaseTrigger, BaseTriggerOptions, TriggerMessage } from '../src/triggers/base.trigger';

class TestTrigger extends BaseTrigger {
  constructor(options?: BaseTriggerOptions) { super(options); }
  send(thread: string, messages: TriggerMessage[]) { return this['notify'](thread, messages); }
}

describe('BaseTrigger Pausable', () => {
  it('drops events when paused and resumes correctly', async () => {
    const t = new TestTrigger();
    const calls: Array<{ thread: string; msgs: TriggerMessage[] }> = [];
    await t.subscribe({ invoke: async (thread, msgs) => { calls.push({ thread, msgs }); } });

    await t.send('th1', [{ content: 'a', info: {} }]);
    expect(calls.length).toBe(1);

    t.pause();
    await t.send('th1', [{ content: 'b', info: {} }]);
    await t.send('th1', [{ content: 'c', info: {} }]);
    expect(calls.length).toBe(1); // still only first

    t.resume();
    await t.send('th1', [{ content: 'd', info: {} }]);
    expect(calls.length).toBe(2);
    expect(calls[1].msgs.map(m => m.content)).toEqual(['d']);
  });

  it('works with debounce + paused gating', async () => {
    vi.useFakeTimers();
    const t = new TestTrigger({ debounceMs: 50 });
    const batches: string[][] = [];
    await t.subscribe({ invoke: async (_thread, msgs) => { batches.push(msgs.map(m => m.content)); } });

    // Pause, then send -> should drop
    t.pause();
    t.send('th', [{ content: 'x', info: {} }]);
    await Promise.resolve();
    expect(batches.length).toBe(0);

    // Resume and send two within window -> single batch
    t.resume();
    t.send('th', [{ content: 'a', info: {} }]);
    vi.advanceTimersByTime(25);
    t.send('th', [{ content: 'b', info: {} }]);
    await vi.advanceTimersByTimeAsync(50);
    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['a', 'b']);
    vi.useRealTimers();
  });
});
