import type { Reference } from './references';

type NormalizeLogger = {
  debug?: (message: string, ...optionalParams: unknown[]) => void;
};

export type NormalizeLegacyRefOptions = {
  basePath?: string;
  knownVaultMounts?: Iterable<string>;
  logger?: NormalizeLogger;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const encodePointerSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');

const buildPointer = (basePath: string | undefined, segments: string[]): string => {
  if (segments.length === 0) return basePath ?? '';
  const pointer = `/${segments.map((segment) => encodePointerSegment(segment)).join('/')}`;
  if (!basePath) return pointer;
  return `${basePath.replace(/\/$/, '')}${pointer}`;
};

const parseVaultReference = (
  input: Record<string, unknown>,
  opts: NormalizeLegacyRefOptions,
  knownMounts: ReadonlySet<string> | undefined,
  path: string[],
): Reference | undefined => {
  const pointer = buildPointer(opts.basePath, path) || '/';

  const value = asNonEmptyString(input.value);
  const explicitMount = asNonEmptyString(input.mount);
  const explicitPath = asNonEmptyString(input.path);
  const explicitKey = asNonEmptyString(input.key);

  let inferredMount: string | undefined;
  let inferredPath: string | undefined;
  let inferredKey: string | undefined;

  let derivedSegments: string[] = [];
  if (value) {
    const cleaned = value.replace(/^\/+|\/+$/g, '');
    derivedSegments = cleaned.split('/').filter((segment) => segment.length > 0);
  }

  if (derivedSegments.length > 0) {
    inferredKey = derivedSegments[derivedSegments.length - 1];
    const pathSegments = derivedSegments.slice(0, -1);
    inferredPath = pathSegments.length > 0 ? pathSegments.join('/') : undefined;
  }

  if (!explicitMount && knownMounts && derivedSegments.length >= 3 && knownMounts.has(derivedSegments[0])) {
    inferredMount = derivedSegments[0];
    const withoutMount = derivedSegments.slice(1, -1);
    inferredPath = withoutMount.length > 0 ? withoutMount.join('/') : undefined;
  }

  const pathValue = asNonEmptyString(explicitPath ?? inferredPath);
  const keyValue = asNonEmptyString(explicitKey ?? inferredKey);
  const mountValue = asNonEmptyString(explicitMount ?? inferredMount) ?? 'secret';

  if (!pathValue || !keyValue) {
    opts.logger?.debug?.('Legacy vault ref not normalized (missing path/key) at %s', pointer);
    return undefined;
  }

  return {
    kind: 'vault',
    path: pathValue,
    key: keyValue,
    ...(mountValue ? { mount: mountValue } : {}),
  } satisfies Reference;
};

const parseEnvReference = (
  input: Record<string, unknown>,
  opts: NormalizeLegacyRefOptions,
  path: string[],
): Reference | undefined => {
  const pointer = buildPointer(opts.basePath, path) || '/';
  const name = asNonEmptyString(input.envVar ?? input.value ?? input.name);
  if (!name) {
    opts.logger?.debug?.('Legacy env ref not normalized (missing name) at %s', pointer);
    return undefined;
  }
  return {
    kind: 'var',
    name,
  } satisfies Reference;
};

const tryNormalizeLegacyRef = (
  input: Record<string, unknown>,
  opts: NormalizeLegacyRefOptions,
  knownMounts: ReadonlySet<string> | undefined,
  path: string[],
): Reference | undefined | null => {
  const source = (input as { source?: unknown }).source;
  if (source !== 'env' && source !== 'vault' && source !== 'static') return undefined;
  if (source === 'static') return null;
  if (source === 'vault') return parseVaultReference(input, opts, knownMounts, path);
  return parseEnvReference(input, opts, path);
};

export function normalizeLegacyRefs<T>(input: T, options: NormalizeLegacyRefOptions = {}): T {
  const seen = new WeakMap<object, unknown>();
  const knownMounts = options.knownVaultMounts ? new Set(options.knownVaultMounts) : undefined;

  const visit = (value: unknown, path: string[]): unknown => {
    if (Array.isArray(value)) {
      if (seen.has(value)) return seen.get(value);
      const result: unknown[] = new Array(value.length);
      seen.set(value, result);
      let changed = false;
      for (let i = 0; i < value.length; i += 1) {
        const next = visit(value[i], path.concat(String(i)));
        result[i] = next;
        if (next !== value[i]) changed = true;
      }
      if (!changed) {
        seen.set(value, value);
        return value;
      }
      return result;
    }

    if (!isPlainObject(value)) return value;
    if (seen.has(value)) return seen.get(value);

    const maybeRef = tryNormalizeLegacyRef(value, options, knownMounts, path);
    if (maybeRef === null) {
      seen.set(value, value);
      return value;
    }
    if (maybeRef !== undefined) return maybeRef;

    const clone: Record<string, unknown> = {};
    seen.set(value, clone);
    let changed = false;
    for (const [key, val] of Object.entries(value)) {
      const next = visit(val, path.concat(key));
      clone[key] = next;
      if (next !== val) changed = true;
    }
    if (!changed) {
      seen.set(value, value);
      return value;
    }
    return clone;
  };

  return visit(input, []) as T;
}
