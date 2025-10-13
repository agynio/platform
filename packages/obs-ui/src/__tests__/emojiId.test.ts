import { describe, it, expect } from 'vitest';
import { emojiHash3, emojiAlphabet } from '../utils/emojiId';

describe('emojiHash3', () => {
  it('is deterministic for same input', () => {
    const a = emojiHash3('thread-123');
    const b = emojiHash3('thread-123');
    expect(a).toBe(b);
  });

  it('produces exactly 3 emojis from curated alphabet', () => {
    const out = emojiHash3('x');
    const cps = Array.from(out);
    expect(cps.length).toBe(3);
    for (const cp of cps) {
      expect(emojiAlphabet).toContain(cp);
    }
  });

  it('output code points are always in curated alphabet', () => {
    const inputs = ['a', 'b', 'longer input 123', '', '🚀mixed'];
    for (const s of inputs) {
      const out = emojiHash3(s);
      const cps = Array.from(out);
      expect(cps.length).toBe(3);
      for (const cp of cps) {
        expect(emojiAlphabet).toContain(cp);
      }
    }
  });
});
