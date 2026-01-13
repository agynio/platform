import { describe, expect, it } from 'vitest';

import { createUtf8Collector } from '../src/infra/container/containerStream.util';

describe('createUtf8Collector', () => {
  it('caps retained output when limit is provided', () => {
    const collector = createUtf8Collector(4);
    collector.append('ab');
    collector.append('cd');
    collector.append('ef');
    collector.flush();

    expect(collector.getText()).toBe('abcd');
    expect(collector.isTruncated()).toBe(true);
  });

  it('retains full output when below limit', () => {
    const collector = createUtf8Collector(10);
    collector.append('hello');
    collector.flush();

    expect(collector.getText()).toBe('hello');
    expect(collector.isTruncated()).toBe(false);
  });
});
