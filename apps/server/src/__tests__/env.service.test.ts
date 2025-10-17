import { describe, it, expect } from 'vitest';
import { EnvService, EnvError, type EnvItem } from '../services/env.service';

class FakeVault {
  constructor(private map: Record<string, string>, private enabled = true) {}
  isEnabled() { return this.enabled; }
  async getSecret(ref: { mount: string; path: string; key: string }): Promise<string | undefined> {
    const k = `${ref.mount}/${ref.path}/${ref.key}`.replace(/\/+/g, '/');
    return this.map[k];
  }
}

describe('EnvService', () => {
  it('resolveEnvItems: static only', async () => {
    const svc = new EnvService(undefined as any);
    const res = await svc.resolveEnvItems([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
    ] satisfies EnvItem[]);
    expect(res).toEqual({ A: '1', B: '2' });
  });

  it('resolveEnvItems: duplicate key error', async () => {
    const svc = new EnvService(undefined as any);
    await expect(
      svc.resolveEnvItems([
        { key: 'A', value: '1' },
        { key: 'A', value: '2' },
      ] as EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_key_duplicate' });
  });

  it('resolveEnvItems: vault disabled error', async () => {
    const svc = new EnvService({ isEnabled: () => false } as any);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'secret/x/y', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_unavailable' });
  });

  it('resolveEnvItems: invalid vault ref', async () => {
    const svc = new EnvService({ isEnabled: () => true } as any);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'bad-ref', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_ref_invalid' });
  });

  it('resolveEnvItems: missing secret error', async () => {
    const vault = new FakeVault({}, true);
    const svc = new EnvService(vault as any);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'secret/app/db/PASSWORD', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_secret_missing' });
  });

  it('resolveEnvItems: successful vault resolution with concurrency', async () => {
    const vault = new FakeVault({
      'secret/app/db/PASSWORD': 'pw',
      'secret/app/api/TOKEN': 'tok',
    });
    const svc = new EnvService(vault as any);
    const res = await svc.resolveEnvItems([
      { key: 'A', value: 'secret/app/db/PASSWORD', source: 'vault' },
      { key: 'B', value: 'secret/app/api/TOKEN', source: 'vault' },
    ]);
    expect(res).toEqual({ A: 'pw', B: 'tok' });
  });

  it('mergeEnv: overlay precedence and empty preservation', () => {
    const svc = new EnvService(undefined as any);
    const base = { A: '1', B: '2' };
    const overlay = { B: '22', C: '' };
    expect(svc.mergeEnv(base, undefined)).toEqual(base);
    expect(svc.mergeEnv(undefined, overlay)).toEqual({ B: '22', C: '' });
    expect(svc.mergeEnv(base, overlay)).toEqual({ A: '1', B: '22', C: '' });
  });

  it('resolveProviderEnv: supports array items with base overlay', async () => {
    const svc = new EnvService(undefined as any);
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv(
      [
        { key: 'A', value: '1' },
        { key: 'B', value: '2' },
      ],
      undefined,
      base,
    );
    expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
  });

  it('resolveProviderEnv: supports map input', async () => {
    const svc = new EnvService(undefined as any);
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv({ A: '1', B: '2' }, undefined, base);
    expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
  });

  it('resolveProviderEnv: undefined or empty returns base or undefined', async () => {
    const svc = new EnvService(undefined as any);
    expect(await svc.resolveProviderEnv(undefined, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv([], undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv({}, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv(undefined, undefined, { A: '1' })).toEqual({ A: '1' });
  });

  it('resolveProviderEnv: base present + empty overlay => {} ; no base + empty overlay => undefined', async () => {
    const svc = new EnvService(undefined as any);
    // empty overlay (array that resolves to empty) with base present -> {}
    const res1 = await svc.resolveProviderEnv([], undefined, { A: '1' });
    expect(res1).toEqual({});
    // empty overlay with no base -> undefined
    const res2 = await svc.resolveProviderEnv([], undefined, undefined);
    expect(res2).toBeUndefined();
  });

  it('resolveProviderEnv: rejects cfgEnvRefs usage', async () => {
    const svc = new EnvService(undefined as any);
    await expect(svc.resolveProviderEnv([], undefined as any, {})).resolves.toEqual({});
    await expect(
      // @ts-expect-error simulate passing a defined cfgEnvRefs param, which should be rejected
      svc.resolveProviderEnv([], 'anything', {} as Record<string, string>),
    ).rejects.toMatchObject({ code: 'env_items_invalid' });
  });
});
