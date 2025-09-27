import { describe, it, expect, vi } from 'vitest';
import { BaseTrigger, TriggerMessage } from '../src/triggers/base.trigger';

class TestTrigger extends BaseTrigger {
  constructor() { super(); }
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

  it('works when paused from the start', async () => {
    const t = new TestTrigger();
    const batches: string[][] = [];
    await t.subscribe({ invoke: async (_thread, msgs) => { batches.push(msgs.map(m => m.content)); } });

    // Pause from start, then send -> should drop
    t.pause();
    t.send('th', [{ content: 'x', info: {} }]);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(batches.length).toBe(0);

    // Resume and send -> should process immediately
    t.resume();
    t.send('th', [{ content: 'a', info: {} }]);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['a']);
  });
});
