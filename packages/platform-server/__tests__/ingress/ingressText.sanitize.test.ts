import { describe, expect, it } from 'vitest';

import {
  createIngressSanitizeState,
  sanitizeIngressChunk,
  sanitizeIngressText,
} from '../../src/common/sanitize/ingressText.sanitize';

describe('sanitizeIngressText', () => {
  it('removes BOM, duplicate replacement prefix, and NUL characters', () => {
    const input = `\uFEFF\uFFFD\uFFFDline\u0000one`;
    const result = sanitizeIngressText(input);

    expect(result.text).toBe('lineone');
    expect(result.strippedBom).toBe(true);
    expect(result.strippedReplacementPrefix).toBe(true);
    expect(result.strippedNullCount).toBe(1);
  });
});

describe('sanitizeIngressChunk', () => {
  it('applies start-of-stream rules only once across chunks', () => {
    const state = createIngressSanitizeState();

    const first = sanitizeIngressChunk('\uFEFF\uFFFD\uFFFD', state);
    expect(first).toBe('');
    expect(state.strippedBom).toBe(true);
    expect(state.strippedReplacementPrefix).toBe(true);

    const second = sanitizeIngressChunk('line\u0000', state);
    expect(second).toBe('line');
    expect(state.strippedNullCount).toBe(1);

    const third = sanitizeIngressChunk('\uFFFDmore', state);
    expect(third).toBe('\uFFFDmore');
  });
});
