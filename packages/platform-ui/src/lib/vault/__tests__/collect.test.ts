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
        { name: 'A', value: '1', source: 'static' },
        { name: 'B', value: 'secret/path/B', source: 'vault' },
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

  it('collects canonical vault refs', () => {
    const direct = { kind: 'vault', mount: 'secret', path: 'app', key: 'TOKEN' };
    const nested = {
      source: 'vault',
      value: { kind: 'vault', mount: 'kv', path: 'prod/service', key: 'API_KEY' },
    };
    const missingMount = { kind: 'vault', path: 'app', key: 'SKIP' };
    const missingKey = {
      source: 'vault',
      value: { kind: 'vault', mount: 'secret', path: 'app', key: '' },
    };
    const out = collectVaultRefs([direct, nested, missingMount, missingKey]);
    expect(out.sort()).toEqual(['secret/app/TOKEN', 'kv/prod/service/API_KEY'].sort());
  });
});
