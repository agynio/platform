import { describe, it, expect, vi } from 'vitest';
import { MessagesBuffer, ProcessBuffer } from '../src/agents/messagesBuffer';

describe('MessagesBuffer', () => {
  it('drains immediately when debounce=0', () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    b.enqueue('t', { content: 'a', info: {} } as any, 1000);
    expect(b.tryDrain('t', ProcessBuffer.AllTogether, 1001).map((m) => m.content)).toEqual(['a']);
  });

  it('debounces until window elapses', () => {
    const b = new MessagesBuffer({ debounceMs: 50 });
    b.enqueue('t', { content: 'a', info: {} } as any, 0);
    expect(b.tryDrain('t', ProcessBuffer.AllTogether, 10)).toEqual([]);
    b.enqueue('t', { content: 'b', info: {} } as any, 40);
    expect(b.tryDrain('t', ProcessBuffer.AllTogether, 80)).toEqual([]);
    expect(b.tryDrain('t', ProcessBuffer.AllTogether, 90).map((m) => m.content)).toEqual(['a', 'b']);
  });

  it('processBuffer oneByOne returns single message per drain', () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    b.enqueue('t', [{ content: 'a', info: {} } as any, { content: 'b', info: {} } as any], 0);
    expect(b.tryDrain('t', ProcessBuffer.OneByOne, 1).map((m) => m.content)).toEqual(['a']);
    expect(b.tryDrain('t', ProcessBuffer.OneByOne, 2).map((m) => m.content)).toEqual(['b']);
    expect(b.tryDrain('t', ProcessBuffer.OneByOne, 3)).toEqual([]);
  });

  it('nextReadyAt returns correct timestamps', () => {
    const b = new MessagesBuffer({ debounceMs: 100 });
    expect(b.nextReadyAt('t')).toBeUndefined();
    b.enqueue('t', { content: 'a', info: {} } as any, 1000);
    expect(b.nextReadyAt('t')).toBe(1100);
  });
});
