import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTrigger, TriggerMessage } from '../src/nodes/slackTrigger/base.trigger';

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

  it('delivers to listeners immediately', async () => {
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
});
