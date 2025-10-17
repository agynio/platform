import { VaultService, type VaultRef } from './vault.service';
import { parseVaultRef } from '../utils/refs';

export class EnvError extends Error {
  code: string;
  details?: unknown;
  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'EnvError';
    this.code = code;
    this.details = details;
  }
}

export type EnvItem = { key: string; value: string; source?: 'static' | 'vault' };

export class EnvService {
  constructor(private vault?: VaultService) {}

  mergeEnv(base?: Record<string, string>, overlay?: Record<string, string>): Record<string, string> {
    return { ...(base || {}), ...(overlay || {}) };
  }

  async resolveEnvItems(items: EnvItem[]): Promise<Record<string, string>> {
    if (!Array.isArray(items)) throw new EnvError('env items must be an array', 'env_items_invalid');
    const out: Record<string, string> = {};
    const seen = new Set<string>();

    const lookups: Array<{ key: string; ref: VaultRef }> = [];
    for (const it of items) {
      const k = it?.key?.trim();
      if (!k) throw new EnvError('env key must be non-empty', 'env_key_invalid', { item: it });
      if (seen.has(k)) throw new EnvError(`duplicate env key: ${k}`, 'env_key_duplicate', { key: k });
      seen.add(k);
      const source = it?.source || 'static';
      if (source === 'vault') {
        if (!this.vault || !this.vault.isEnabled()) throw new EnvError('vault unavailable', 'vault_unavailable');
        try {
          lookups.push({ key: k, ref: parseVaultRef(it.value) });
        } catch (e) {
          throw new EnvError('invalid vault ref', 'vault_ref_invalid', { value: it.value, error: e });
        }
      } else {
        out[k] = it.value ?? '';
      }
    }

    if (lookups.length) {
      const vlt = this.vault;
      if (!vlt || !vlt.isEnabled()) throw new EnvError('vault unavailable', 'vault_unavailable');
      try {
        const resolved = await Promise.all(
          lookups.map(async ({ key, ref }) => {
            const val = await vlt.getSecret(ref);
            if (val == null) throw new EnvError('missing secret', 'vault_secret_missing', { ref });
            return { key, val: String(val) };
          }),
        );
        for (const { key, val } of resolved) out[key] = val;
      } catch (e) {
        if (e instanceof EnvError) throw e;
        throw new EnvError('vault resolution failed', 'vault_resolution_failed', { error: e });
      }
    }

    return out;
  }

  async resolveProviderEnv(
    cfgEnv: Record<string, string> | EnvItem[] | undefined,
    cfgEnvRefs: undefined,
    base?: Record<string, string>,
  ): Promise<Record<string, string> | undefined> {
    if (cfgEnvRefs !== undefined) throw new EnvError('envRefs not supported', 'env_items_invalid');
    const hasBaseParam = base !== undefined;
    const baseMap = base || {};
    if (!cfgEnv) return Object.keys(baseMap).length || hasBaseParam ? { ...baseMap } : undefined;
    if (Array.isArray(cfgEnv)) {
      const overlay = await this.resolveEnvItems(cfgEnv);
      const merged = this.mergeEnv(baseMap, overlay);
      // Special-case: when cfgEnv is provided as an array but resolves to empty,
      // preserve explicit emptiness (return {}) instead of undefined when a base
      // value was provided by caller. This allows callers to distinguish between
      // "no env provided" vs "provided but empty".
      if (!Object.keys(merged).length) return hasBaseParam ? {} : undefined;
      return merged;
    }
    if (typeof cfgEnv === 'object') {
      const merged = this.mergeEnv(baseMap, cfgEnv as Record<string, string>);
      return Object.keys(merged).length || hasBaseParam ? merged : undefined;
    }
    throw new EnvError('invalid env configuration', 'env_items_invalid');
  }
}
