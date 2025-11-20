import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Reference } from '@agyn/shared';
import { ReferenceResolverService } from '../utils/reference-resolver.service';
import { ResolveError } from '../utils/references';

function mapResolveErrorCode(code: string): string {
  switch (code) {
    case 'provider_missing':
      return 'env_provider_missing';
    case 'permission_denied':
      return 'env_permission_denied';
    case 'invalid_reference':
      return 'env_invalid_reference';
    case 'unresolved_reference':
      return 'env_reference_unresolved';
    case 'max_depth_exceeded':
      return 'env_max_depth_exceeded';
    case 'cycle_detected':
      return 'env_cycle_detected';
    case 'type_mismatch':
      return 'env_type_mismatch';
    default:
      return 'env_resolution_failed';
  }
}

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

export type EnvValue = string | Reference;
export type EnvItem = { key: string; value: EnvValue };

@Injectable()
export class EnvService {
  constructor(@Optional() @Inject(ReferenceResolverService) private readonly referenceResolver?: ReferenceResolverService) {}

  mergeEnv(base?: Record<string, string>, overlay?: Record<string, string>): Record<string, string> {
    return { ...(base || {}), ...(overlay || {}) };
  }

  async resolveEnvItems(items: EnvItem[], opts?: { graphName?: string; strict?: boolean }): Promise<Record<string, string>> {
    if (!Array.isArray(items)) throw new EnvError('env items must be an array', 'env_items_invalid');
    const seen = new Set<string>();
    const normalized: EnvItem[] = [];
    for (const it of items) {
      const key = typeof it?.key === 'string' ? it.key.trim() : '';
      if (!key) throw new EnvError('env key must be non-empty', 'env_key_invalid', { item: it });
      if (seen.has(key)) throw new EnvError(`duplicate env key: ${key}`, 'env_key_duplicate', { key });
      seen.add(key);
      normalized.push({ key, value: it?.value ?? '' });
    }

    if (!this.referenceResolver) {
      const result: Record<string, string> = {};
      for (const item of normalized) {
        if (typeof item.value === 'object' && item.value !== null) {
          throw new EnvError('env provider missing for references', 'env_provider_missing', { key: item.key });
        }
        result[item.key] = typeof item.value === 'string' ? item.value : String(item.value ?? '');
      }
      return result;
    }

    try {
      const { output } = await this.referenceResolver.resolve(normalized, {
        graphName: opts?.graphName,
        strict: opts?.strict ?? true,
        basePath: '/env',
      });

      const result: Record<string, string> = {};
      for (const item of output) {
        const val = item.value;
        if (val === null || (typeof val === 'object' && val !== null)) {
          throw new EnvError('env reference unresolved', 'env_reference_unresolved', { key: item.key, value: val });
        }
        result[item.key] = typeof val === 'string' ? val : String(val);
      }
      return result;
    } catch (err: unknown) {
      if (err instanceof EnvError) throw err;
      if (err instanceof ResolveError) {
        throw new EnvError(err.message, mapResolveErrorCode(err.code), { path: err.path, source: err.source });
      }
      const details =
        err instanceof Error
          ? { message: err.message, name: err.name }
          : { value: err };
      throw new EnvError('env resolution failed', 'env_resolution_failed', details);
    }
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
