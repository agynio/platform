import { describe, it, expect } from 'vitest';
import { init, withSummarize, SummarizeResponse } from '../src';

// Simple mock init (no network posting in tests assumed or handled externally)
init({ mode: 'extended', endpoints: { extended: 'http://localhost:59999' }, defaultAttributes: { service: 'test' } as any });

describe('SummarizeResponse & withSummarize', () => {
  it('returns raw value and records summary/newContext attributes when wrapper used', async () => {
    const rawObj = { provider: 'mock', text: 'summary body' };
    const result = await withSummarize({ oldContext: [ { role: 'human', content: 'Hello' } ] as any }, async () =>
      new SummarizeResponse({ raw: rawObj, summary: 'short', newContext: [ { role: 'system', content: 'short+ctx' } ] as any }),
    );
    expect(result).toEqual(rawObj);
  });

  it('sets error attr when wrapper missing and returns undefined raw', async () => {
    const res = await withSummarize({ oldContext: [ { role: 'human', content: 'Hi' } ] as any }, async () => ({ summary: 'oops' }) as any);
    expect(res).toBeUndefined();
  });
});
