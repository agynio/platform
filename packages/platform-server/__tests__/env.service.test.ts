import { describe, it, expect, vi } from 'vitest';
import { EnvService, type EnvItem } from '../src/env/env.service';

describe('EnvService', () => {
  it('resolveEnvItems: static only', async () => {
    const svc = new EnvService();
    const res = await svc.resolveEnvItems([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ] satisfies EnvItem[]);
    expect(res).toEqual({ A: '1', B: '2' });
  });

  it('resolveEnvItems: duplicate name error', async () => {
    const svc = new EnvService();
    await expect(
      svc.resolveEnvItems([
        { name: 'A', value: '1' },
        { name: 'A', value: '2' },
      ] satisfies EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_name_duplicate' });
  });

  it('resolveEnvItems: rejects non-string values', async () => {
    const svc = new EnvService();
    await expect(
      svc.resolveEnvItems([
        { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } as unknown as string },
      ] satisfies EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_value_invalid' });
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
    const svc = new EnvService();
    const spy = vi.spyOn(svc, 'resolveEnvItems').mockResolvedValue({ A: '1', B: '2' });
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
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('resolveProviderEnv: supports map input', async () => {
    const svc = new EnvService();
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv({ A: '1', B: '2' }, undefined, base);
    expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
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
