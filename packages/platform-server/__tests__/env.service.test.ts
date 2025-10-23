import { describe, it, expect, vi } from 'vitest';
import { EnvService, EnvError, type EnvItem } from '../src/services/env.service';
import { VaultService, type VaultConfig } from '../src/core/services/vault.service';

// Helper to build a real VaultService with desired enabled state
function makeVault(cfg: Partial<VaultConfig>): VaultService {
  const base: VaultConfig = {
    enabled: false,
    addr: 'http://localhost:8200',
    token: undefined,
    timeoutMs: 50,
    defaultMounts: ['secret'],
  };
  return new VaultService({ ...base, ...cfg });
}

describe('EnvService', () => {
  it('resolveEnvItems: static only', async () => {
    const svc = new EnvService(undefined);
    const res = await svc.resolveEnvItems([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
    ] satisfies EnvItem[]);
    expect(res).toEqual({ A: '1', B: '2' });
  });

  it('resolveEnvItems: duplicate key error', async () => {
    const svc = new EnvService(undefined);
    await expect(
      svc.resolveEnvItems([
        { key: 'A', value: '1' },
        { key: 'A', value: '2' },
      ] as EnvItem[]),
    ).rejects.toMatchObject({ code: 'env_key_duplicate' });
  });

  it('resolveEnvItems: vault disabled error', async () => {
    const vault = makeVault({ enabled: false });
    const svc = new EnvService(vault);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'secret/x/y', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_unavailable' });
  });

  it('resolveEnvItems: invalid vault ref', async () => {
    const vault = makeVault({ enabled: true, token: 't' });
    const svc = new EnvService(vault);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'bad-ref', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_ref_invalid' });
  });

  it('resolveEnvItems: missing secret error', async () => {
    const vault = makeVault({ enabled: true, token: 't' });
    vi.spyOn(vault, 'getSecret').mockResolvedValue(undefined);
    const svc = new EnvService(vault);
    await expect(svc.resolveEnvItems([{ key: 'A', value: 'secret/app/db/PASSWORD', source: 'vault' }])).rejects.toMatchObject({ code: 'vault_secret_missing' });
  });

  it('resolveEnvItems: successful vault resolution with concurrency', async () => {
    const vault = makeVault({ enabled: true, token: 't' });
    const map: Record<string, string> = {
      'secret/app/db/PASSWORD': 'pw',
      'secret/app/api/TOKEN': 'tok',
    };
    vi.spyOn(vault, 'getSecret').mockImplementation(async (ref) => {
      const k = `${ref.mount}/${ref.path}/${ref.key}`.replace(/\/+/g, '/');
      return map[k];
    });
    const svc = new EnvService(vault);
    const res = await svc.resolveEnvItems([
      { key: 'A', value: 'secret/app/db/PASSWORD', source: 'vault' },
      { key: 'B', value: 'secret/app/api/TOKEN', source: 'vault' },
    ]);
    expect(res).toEqual({ A: 'pw', B: 'tok' });
  });

  it('mergeEnv: overlay precedence and empty preservation', () => {
    const svc = new EnvService(undefined);
    const base = { A: '1', B: '2' };
    const overlay = { B: '22', C: '' };
    expect(svc.mergeEnv(base, undefined)).toEqual(base);
    expect(svc.mergeEnv(undefined, overlay)).toEqual({ B: '22', C: '' });
    expect(svc.mergeEnv(base, overlay)).toEqual({ A: '1', B: '22', C: '' });
  });

  it('resolveProviderEnv: supports array items with base overlay', async () => {
    const svc = new EnvService(undefined);
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
    const svc = new EnvService(undefined);
    const base = { BASE: 'x' };
    const merged = await svc.resolveProviderEnv({ A: '1', B: '2' }, undefined, base);
    expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
  });

  it('resolveProviderEnv: undefined or empty returns base or undefined', async () => {
    const svc = new EnvService(undefined);
    expect(await svc.resolveProviderEnv(undefined, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv([], undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv({}, undefined, undefined)).toBeUndefined();
    expect(await svc.resolveProviderEnv(undefined, undefined, { A: '1' })).toEqual({ A: '1' });
  });

  it('resolveProviderEnv: base present + empty overlay => {} ; no base + empty overlay => undefined', async () => {
    const svc = new EnvService(undefined);
    // empty overlay (array that resolves to empty) with base present -> {}
    const res1 = await svc.resolveProviderEnv([], undefined, { A: '1' });
    expect(res1).toEqual({});
    // empty overlay with no base -> undefined
    const res2 = await svc.resolveProviderEnv([], undefined, undefined);
    expect(res2).toBeUndefined();
  });

  it('resolveProviderEnv: rejects cfgEnvRefs usage', async () => {
    const svc = new EnvService(undefined);
    await expect(svc.resolveProviderEnv([], undefined, {})).resolves.toEqual({});
    await expect(
      // @ts-expect-error simulate passing a defined cfgEnvRefs param, which should be rejected
      svc.resolveProviderEnv([], 'anything', {} as Record<string, string>),
    ).rejects.toMatchObject({ code: 'env_items_invalid' });
  });
});
