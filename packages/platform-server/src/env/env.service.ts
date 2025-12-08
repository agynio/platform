import { Injectable } from '@nestjs/common';
import type { Reference } from '../utils/references';
import { ResolveError } from '../utils/references';
import { ReferenceResolverService } from '../utils/reference-resolver.service';

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
  value: string | Reference;
};

@Injectable()
export class EnvService {
  constructor(private readonly referenceResolver?: ReferenceResolverService) {}

  mergeEnv(base?: Record<string, string>, overlay?: Record<string, string>): Record<string, string> {
    return { ...(base || {}), ...(overlay || {}) };
  }

  async resolveEnvItems(items: EnvItem[]): Promise<Record<string, string>> {
    if (!Array.isArray(items)) throw new EnvError('env items must be an array', 'env_items_invalid');
    const seen = new Set<string>();
    const result: Record<string, string> = {};
    for (let index = 0; index < items.length; index += 1) {
      const rawItem = items[index];
      const item = rawItem ?? ({} as EnvItem);
      const rawName = typeof item.name === 'string' ? item.name.trim() : '';
      if (!rawName) {
        throw new EnvError('env name must be non-empty', 'env_name_invalid', { item: rawItem });
      }
      if (seen.has(rawName)) {
        throw new EnvError(`duplicate env name: ${rawName}`, 'env_name_duplicate', { name: rawName });
      }
      seen.add(rawName);
      const resolved = await this.resolveEnvValue(item.value, rawName, index);
      result[rawName] = resolved;
    }
    return result;
  }

  private async resolveEnvValue(value: string | Reference, name: string, index: number): Promise<string> {
    if (typeof value === 'string') {
      return value;
    }
    const resolver = this.referenceResolver;
    if (!resolver) {
      throw new EnvError('reference resolver unavailable', 'env_reference_resolver_missing', { name, value });
    }
    const pointerSegment = name.replace(/~/g, '~0').replace(/\//g, '~1');
    const basePath = `/env/${pointerSegment || index}/value`;
    try {
      const { output } = await resolver.resolve(value, {
        strict: true,
        coerceToString: true,
        basePath,
      });
      if (typeof output !== 'string') {
        throw new EnvError('resolved env value must be string', 'env_value_invalid', { name, value: output });
      }
      return output;
    } catch (error) {
      if (error instanceof EnvError) throw error;
      if (error instanceof ResolveError) {
        throw new EnvError('failed to resolve env reference', 'env_reference_unresolved', {
          name,
          value,
          code: error.code,
          path: error.path,
          source: error.source,
        });
      }
      throw new EnvError('failed to resolve env reference', 'env_reference_error', { name, value, error });
    }
  }

  async resolveProviderEnv(
    cfgEnv: Record<string, string | Reference> | EnvItem[] | undefined,
    cfgEnvRefs: undefined,
    base?: Record<string, string>,
  ): Promise<Record<string, string> | undefined> {
    if (cfgEnvRefs !== undefined) throw new EnvError('envRefs not supported', 'env_items_invalid');
    const hasBaseParam = base !== undefined;
    const baseMap = base ? { ...base } : {};
    if (!cfgEnv) return Object.keys(baseMap).length || hasBaseParam ? { ...baseMap } : undefined;
    let overlay: Record<string, string> = {};
    if (Array.isArray(cfgEnv)) {
      overlay = await this.resolveEnvItems(cfgEnv);
    } else if (cfgEnv && typeof cfgEnv === 'object') {
      const items = Object.entries(cfgEnv).map(([name, value]) => ({ name, value })) as EnvItem[];
      overlay = await this.resolveEnvItems(items);
    } else {
      throw new EnvError('invalid env configuration', 'env_items_invalid');
    }
    const merged = this.mergeEnv(baseMap, overlay);
    if (!Object.keys(merged).length) {
      return hasBaseParam ? {} : undefined;
    }
    return merged;
  }
}
