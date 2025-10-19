import { describe, it, expect } from 'vitest';
import { init, withSpan, currentSpan } from '../src/index';

describe('ALS context', () => {
  it('propagates', async () => {
    init({ mode: 'extended', endpoints: { extended: '' } });
    await withSpan({ label: 'a' }, async () => {
      const parent = currentSpan();
      expect(parent?.spanId).toBeDefined();
      await withSpan({ label: 'b' }, async () => {
        const child = currentSpan();
        expect(child?.parentSpanId).toBe(parent?.spanId);
      });
    });
  });
});
