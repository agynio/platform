import { Injectable } from '@nestjs/common';

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

export type EnvItem = {
  name: string;
  value: string;
};

@Injectable()
export class EnvService {
  mergeEnv(base?: Record<string, string>, overlay?: Record<string, string>): Record<string, string> {
    return { ...(base || {}), ...(overlay || {}) };
  }

  async resolveEnvItems(items: EnvItem[]): Promise<Record<string, string>> {
    if (!Array.isArray(items)) throw new EnvError('env items must be an array', 'env_items_invalid');
    const seen = new Set<string>();
    const result: Record<string, string> = {};
    for (const rawItem of items) {
      const item = rawItem ?? ({} as EnvItem);
      const rawName = typeof item.name === 'string' ? item.name.trim() : '';
      if (!rawName) {
        throw new EnvError('env name must be non-empty', 'env_name_invalid', { item: rawItem });
      }
      if (seen.has(rawName)) {
        throw new EnvError(`duplicate env name: ${rawName}`, 'env_name_duplicate', { name: rawName });
      }
      seen.add(rawName);
      if (typeof item.value !== 'string') {
        throw new EnvError('env value must be a string', 'env_value_invalid', { name: rawName, value: item.value });
      }
      result[rawName] = item.value;
    }
    return result;
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
