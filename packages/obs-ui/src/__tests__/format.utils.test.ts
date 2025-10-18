import { describe, it, expect } from 'vitest';
import { toJSONStable, toYAML } from '../utils/format';

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
});

