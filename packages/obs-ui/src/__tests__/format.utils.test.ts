import { describe, it, expect } from 'vitest';
import { toJSONStable, toYAML, formatDuration } from '../utils/format';

describe('format utils', () => {
  it('formats JSON string to pretty JSON', () => {
    const s = toJSONStable('{"a":1,"b":[2,3]}');
    expect(s).toContain('\n');
    expect(JSON.parse(s)).toEqual({ a: 1, b: [2, 3] });
  });

  it('formats object to YAML', () => {
    const y = toYAML({a: 1, b: [2,3]});
    expect(y).toMatch(/a: 1/);
    expect(y).toMatch(/- 2/);
  });
  it('returns raw string when non-JSON string for toJSONStable', () => {
    const s = toJSONStable('not json');
    expect(s).toBe('not json');
  });
  it('stabilizes key order in JSON', () => {
    const s = toJSONStable({ b: 1, a: { d: 2, c: 3 } });
    expect(s.indexOf('"a"')).toBeLessThan(s.indexOf('"b"'));
    expect(s.indexOf('"c"')).toBeLessThan(s.indexOf('"d"'));
  });

  describe('formatDuration', () => {
    it('handles special values', () => {
      expect(formatDuration(0)).toBe('0 ms');
      expect(formatDuration(NaN)).toBe('-');
      expect(formatDuration(undefined)).toBe('-');
      expect(formatDuration(null)).toBe('-');
    });

    it('applies thresholds and rounding', () => {
      expect(formatDuration(999)).toBe('999 ms');
      expect(formatDuration(1000)).toBe('1.0 s');
      expect(formatDuration(12_345)).toBe('12.3 s');
      // threshold check before rounding
      expect(formatDuration(59_950)).toBe('60.0 s');
      expect(formatDuration(60_000)).toBe('1.0 m');
      expect(formatDuration(3_599_950)).toBe('60.0 m');
      expect(formatDuration(3_600_000)).toBe('1.0 h');
    });

    it('preserves sign for negatives', () => {
      expect(formatDuration(-532)).toBe('-532 ms');
      expect(formatDuration(-1234)).toBe('-1.2 s');
    });

    it('supports truncate option', () => {
      expect(formatDuration(1299, { truncate: true })).toBe('1.2 s');
      expect(formatDuration(1250, { truncate: true })).toBe('1.2 s');
      expect(formatDuration(59_949, { truncate: true })).toBe('59.9 s');
      expect(formatDuration(60_000, { truncate: true })).toBe('1.0 m');
    });

    it('supports custom labels and spacing', () => {
      const custom = { ms: 'millis', s: 'sec', m: 'min', h: 'hr' } as const;
      expect(formatDuration(1000, { unitLabels: custom, space: false })).toBe('1.0sec');
      expect(formatDuration(0, { unitLabels: custom, space: false })).toBe('0millis');
    });
  });
});
