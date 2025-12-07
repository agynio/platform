import { describe, it, expect, vi } from 'vitest';
import { EnvService, type EnvItem } from '../src/env/env.service';
import type { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import { ResolveError } from '../src/utils/references';

const emptyReport = () => ({
  events: [],
  counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 },
});

const secretKey = (ref: { mount?: string | null; path: string; key: string }) => `${ref.mount ?? ''}:${ref.path}:${ref.key}`;

const createResolver = (overrides?: {
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
}): { service: ReferenceResolverService; mock: ReturnType<typeof vi.fn> } => {
  const secrets = overrides?.secrets ?? {};
  const variables = overrides?.variables ?? {};
  const resolve = vi.fn(async (input: string | EnvItem['value'], opts?: { basePath?: string }) => {
    if (typeof input === 'string') {
      return { output: input, report: emptyReport() };
    }
    if (input.kind === 'vault') {
      const key = secretKey(input);
      if (!(key in secrets)) {
        throw new ResolveError('unresolved_reference', 'secret missing', {
          path: opts?.basePath ?? '/env',
          source: 'secret',
        });
      }
      return { output: secrets[key], report: emptyReport() };
    }
    if (input.kind === 'var') {
      if (!(input.name in variables)) {
        throw new ResolveError('unresolved_reference', 'variable missing', {
          path: opts?.basePath ?? '/env',
          source: 'variable',
        });
      }
      return { output: variables[input.name], report: emptyReport() };
    }
    throw new ResolveError('invalid_reference', 'unsupported reference', {
      path: opts?.basePath ?? '/env',
      source: 'variable',
    });
  });
  const service = { resolve } as unknown as ReferenceResolverService;
  return { service, mock: resolve };
};

describe('EnvService', () => {
  it('resolveEnvItems: static only', async () => {
    const { service: resolver } = createResolver();
    const svc = new EnvService(resolver);
    const res = await svc.resolveEnvItems(
      [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
      ] satisfies EnvItem[],
    );
    expect(res).toEqual({ A: '1', B: '2' });
  });

  it('resolveEnvItems: resolves secret and variable references', async () => {
    const { service: resolver } = createResolver({
        secrets: { [secretKey({ path: 'secret/app/db', key: 'PASSWORD' })]: 'postgres' },
        variables: { API_TOKEN: 'token-123' },
      });
    const svc = new EnvService(resolver);
    const res = await svc.resolveEnvItems(
      [
        { name: 'DB_PASSWORD', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
        { name: 'API_TOKEN', value: { kind: 'var', name: 'API_TOKEN' } },
      ] satisfies EnvItem[],
    );
    expect(res).toEqual({ DB_PASSWORD: 'postgres', API_TOKEN: 'token-123' });
  });

  it('resolveEnvItems: duplicate name error', async () => {
    const { service: resolver } = createResolver();
    const svc = new EnvService(resolver);
    await expect(
      svc.resolveEnvItems([
        { name: 'A', value: '1' },
        { name: 'A', value: '2' },
      ] satisfies EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_name_duplicate' });
  });

  it('resolveEnvItems: throws when resolver unavailable for reference', async () => {
    const svc = new EnvService();
    await expect(
      svc.resolveEnvItems([
        { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
      ] satisfies EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_reference_resolver_missing' });
  });

  it('resolveEnvItems: wraps unresolved references with EnvError', async () => {
    const { service: resolver, mock } = createResolver();
    const svc = new EnvService(resolver);
    await expect(
      svc.resolveEnvItems([
        { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
      ] satisfies EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_reference_unresolved', details: expect.objectContaining({ path: '/env/A/value' }) });
    expect(mock.mock.calls[0][1]).toMatchObject({ basePath: '/env/A/value' });
  });

  it('mergeEnv: overlay precedence and empty preservation', () => {
    const svc = new EnvService();
    const base = { A: '1', B: '2' };
    const overlay = { B: '22', C: '' };
    expect(svc.mergeEnv(base, undefined)).toEqual(base);
    expect(svc.mergeEnv(undefined, overlay)).toEqual({ B: '22', C: '' });
    expect(svc.mergeEnv(base, overlay)).toEqual({ A: '1', B: '22', C: '' });
  });

  it('resolveProviderEnv: supports array items with base overlay', async () => {
    const { service: resolver } = createResolver();
    const svc = new EnvService(resolver);
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv(
      [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
      ] satisfies EnvItem[],
      undefined,
      base,
    );
    expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
  });

  it('resolveProviderEnv: supports map input', async () => {
    const { service: resolver } = createResolver({
        secrets: { [secretKey({ path: 'secret/app/db', key: 'PASSWORD' })]: 'postgres' },
      });
    const svc = new EnvService(resolver);
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv(
      { A: '1', PASSWORD: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
      undefined,
      base,
    );
    expect(merged).toEqual({ BASE: 'x', A: '1', PASSWORD: 'postgres' });
  });

  it('resolveProviderEnv: undefined or empty returns base or undefined', async () => {
    const svc = new EnvService();
    expect(await svc.resolveProviderEnv(undefined, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv([], undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv({}, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv(undefined, undefined, { A: '1' })).toEqual({ A: '1' });
  });

  it('resolveProviderEnv: base present + empty overlay => {} ; no base + empty overlay => undefined', async () => {
    const svc = new EnvService();
    vi.spyOn(svc, 'resolveEnvItems').mockResolvedValue({});
    vi.spyOn(svc, 'mergeEnv').mockImplementation((_base, _overlay) => ({}));
    const res1 = await svc.resolveProviderEnv([], undefined, { A: '1' });
    expect(res1).toEqual({});
    const res2 = await svc.resolveProviderEnv([], undefined, undefined);
    expect(res2).toBeUndefined();
  });

  it('resolveProviderEnv: rejects cfgEnvRefs usage', async () => {
    const svc = new EnvService();
    await expect(svc.resolveProviderEnv([], undefined, {})).resolves.toEqual({});
    await expect(
      // @ts-expect-error simulate passing a defined cfgEnvRefs param, which should be rejected
      svc.resolveProviderEnv([], 'anything', {} as Record<string, string>),
    ).rejects.toMatchObject({ code: 'env_items_invalid' });
  });
});
