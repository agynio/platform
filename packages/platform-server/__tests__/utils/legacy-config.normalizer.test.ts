import { describe, expect, it, vi } from 'vitest';

import { normalizeLegacyRefs } from '../../src/utils/legacy-config.normalizer';

describe('normalizeLegacyRefs', () => {
  it('normalizes legacy vault refs with default mount when no known mounts provided', () => {
    const input = {
      token: { source: 'vault', value: 'secrets/rowan/GITHUB_TOKEN' },
    } as const;
    const output = normalizeLegacyRefs(input);
    expect(output).toEqual({
      token: {
        kind: 'vault',
        mount: 'secret',
        path: 'secrets/rowan',
        key: 'GITHUB_TOKEN',
      },
    });
  });

  it('uses known mounts to strip mount segment from legacy values', () => {
    const input = {
      token: { source: 'vault', value: 'secret/github/GH_TOKEN' },
    } as const;
    const output = normalizeLegacyRefs(input, { knownVaultMounts: ['secret', 'kv'] });
    expect(output).toEqual({
      token: {
        kind: 'vault',
        mount: 'secret',
        path: 'github',
        key: 'GH_TOKEN',
      },
    });
  });

  it('normalizes env refs from envVar or value field', () => {
    const envVarShape = normalizeLegacyRefs({ ref: { source: 'env', envVar: 'GH_TOKEN' } });
    const valueShape = normalizeLegacyRefs({ ref: { source: 'env', value: 'API_TOKEN' } });
    expect(envVarShape).toEqual({ ref: { kind: 'var', name: 'GH_TOKEN' } });
    expect(valueShape).toEqual({ ref: { kind: 'var', name: 'API_TOKEN' } });
  });

  it('recursively normalizes nested objects and arrays', () => {
    const input = {
      nested: [
        {
          inner: {
            source: 'vault',
            value: 'secret/team/INTEGRATION_TOKEN',
          },
        },
      ],
    } as const;

    const output = normalizeLegacyRefs(input, { knownVaultMounts: ['secret'] });
    expect(output).toEqual({
      nested: [
        {
          inner: {
            kind: 'vault',
            mount: 'secret',
            path: 'team',
            key: 'INTEGRATION_TOKEN',
          },
        },
      ],
    });

    expect(input).toEqual({
      nested: [
        {
          inner: {
            source: 'vault',
            value: 'secret/team/INTEGRATION_TOKEN',
          },
        },
      ],
    });
  });

  it('leaves static refs unchanged', () => {
    const staticRef = { source: 'static', value: 'literal' } as const;
    const output = normalizeLegacyRefs(staticRef);
    expect(output).toBe(staticRef);
  });

  it('returns legacy value when vault ref is ambiguous and logs debug', () => {
    const logger = { debug: vi.fn() };
    const legacy = { source: 'vault', value: 'TOKEN' } as const;
    const output = normalizeLegacyRefs({ token: legacy }, { basePath: '/cfg', logger });
    expect(output.token).toBe(legacy);
    expect(logger.debug).toHaveBeenCalledWith('Legacy vault ref not normalized (missing path/key) at %s', '/cfg/token');
  });

  it('returns legacy value when env ref name missing and logs debug', () => {
    const logger = { debug: vi.fn() };
    const legacy = { source: 'env' } as const;
    const output = normalizeLegacyRefs({ ref: legacy }, { basePath: '/cfg', logger });
    expect(output.ref).toBe(legacy);
    expect(logger.debug).toHaveBeenCalledWith('Legacy env ref not normalized (missing name) at %s', '/cfg/ref');
  });
});
