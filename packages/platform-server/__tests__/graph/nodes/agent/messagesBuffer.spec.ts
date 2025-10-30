import { describe, it, expect } from 'vitest';
import { MessagesBuffer, ProcessBuffer } from '../messagesBuffer';
import { HumanMessage } from '@agyn/llm';

describe('MessagesBuffer drain behavior', () => {
  it('AllTogether drains all messages FIFO', () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    const t = 'thread';
    b.enqueue(t, [HumanMessage.fromText('a'), HumanMessage.fromText('b'), HumanMessage.fromText('c')], 0);
    const drained = b.tryDrain(t, ProcessBuffer.AllTogether, 1);
    expect(drained.map((m) => (m instanceof HumanMessage ? m.text : ''))).toEqual(['a', 'b', 'c']);
    expect(b.tryDrain(t, ProcessBuffer.AllTogether, 2)).toEqual([]);
  });

  it('OneByOne drains exactly one message per call in FIFO order', () => {
    const b = new MessagesBuffer({ debounceMs: 0 });
    const t = 'thread2';
    b.enqueue(t, [HumanMessage.fromText('x'), HumanMessage.fromText('y'), HumanMessage.fromText('z')], 0);
    const d1 = b.tryDrain(t, ProcessBuffer.OneByOne, 1);
    const d2 = b.tryDrain(t, ProcessBuffer.OneByOne, 2);
    const d3 = b.tryDrain(t, ProcessBuffer.OneByOne, 3);
    const d4 = b.tryDrain(t, ProcessBuffer.OneByOne, 4);
    const texts = (arr: Array<unknown>) => arr.map((m) => (m instanceof HumanMessage ? m.text : ''));
    expect(texts(d1)).toEqual(['x']);
    expect(texts(d2)).toEqual(['y']);
    expect(texts(d3)).toEqual(['z']);
    expect(d4.length).toBe(0);
  });
});
