import { describe, it, expect } from 'vitest';
import { collectVaultRefs } from '../../vault/collect';

describe('collectVaultRefs', () => {
  it('returns empty for primitives/null', () => {
    expect(collectVaultRefs(null)).toEqual([]);
    expect(collectVaultRefs(undefined)).toEqual([]);
    expect(collectVaultRefs(1 as unknown as object)).toEqual([]);
  });

  it('collects from nested objects and arrays', () => {
    const input = {
      env: [
        { key: 'A', value: '1', source: 'static' },
        { key: 'B', value: 'secret/path/B', source: 'vault' },
      ],
      nested: {
        token: { value: 'x/y/z', source: 'vault' },
        list: [
          { something: 1 },
          { value: 'm/p/k', source: 'vault' },
        ],
      },
    };
    const out = collectVaultRefs(input);
    expect(out.sort()).toEqual(['secret/path/B', 'x/y/z', 'm/p/k'].sort());
  });

  it('ignores objects without string value or source!=vault', () => {
    const input = { a: { value: 1, source: 'vault' }, b: { value: 'x', source: 'static' } };
    expect(collectVaultRefs(input)).toEqual([]);
  });
});

