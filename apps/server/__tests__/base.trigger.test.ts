import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTrigger, TriggerMessage } from '../src/triggers/base.trigger';

// Concrete test subclass exposing protected notify
class TestTrigger extends BaseTrigger {
  constructor() {
    super();
  }
  emit(thread: string, messages: TriggerMessage[]) {
    return this.notify(thread, messages);
  }
}

describe('BaseTrigger', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('delivers immediately without buffering', async () => {
    const trigger = new TestTrigger();
    const received: { thread: string; messages: TriggerMessage[] }[] = [];
    await trigger.subscribe({
      invoke: async (thread, messages) => {
        received.push({ thread, messages });
      },
    });
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    expect(received.length).toBe(1);
    expect(received[0].messages.map((m) => m.content)).toEqual(['a']);
  });

  it('delivers each call immediately (no debouncing)', async () => {
    const trigger = new TestTrigger();
    const received: TriggerMessage[][] = [];
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received.push(messages);
      },
    });
    trigger.emit('t1', [{ content: 'a', info: {} }]);
    trigger.emit('t1', [{ content: 'b', info: {} }]);
    
    // Allow async operations to complete
    await new Promise(resolve => setTimeout(resolve, 1));
    
    expect(received.length).toBe(2);
    expect(received[0].map((m) => m.content)).toEqual(['a']);
    expect(received[1].map((m) => m.content)).toEqual(['b']);
  });

  it('delivers to multiple listeners immediately', async () => {
    const trigger = new TestTrigger();
    const received1: TriggerMessage[] = [];
    const received2: TriggerMessage[] = [];
    
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received1.push(...messages);
      },
    });
    
    await trigger.subscribe({
      invoke: async (_thread, messages) => {
        received2.push(...messages);
      },
    });
    
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    
    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);
    expect(received1[0].content).toBe('a');
    expect(received2[0].content).toBe('a');
  });

  it('handles multiple threads independently', async () => {
    const trigger = new TestTrigger();
    const received: Array<{ thread: string; messages: TriggerMessage[] }> = [];
    
    await trigger.subscribe({
      invoke: async (thread, messages) => {
        received.push({ thread, messages });
      },
    });
    
    await trigger.emit('t1', [{ content: 'a', info: {} }]);
    await trigger.emit('t2', [{ content: 'b', info: {} }]);
    
    expect(received.length).toBe(2);
    expect(received.find(r => r.thread === 't1')?.messages[0].content).toBe('a');
    expect(received.find(r => r.thread === 't2')?.messages[0].content).toBe('b');
  });
});
