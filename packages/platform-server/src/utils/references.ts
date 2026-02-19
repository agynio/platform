import type {
  Reference,
  ResolutionErrorCode,
  ResolutionEvent,
  ResolutionEventSource,
  ResolutionReport,
  SecretRef,
  VariableRef,
} from '@agyn/shared';

export type {
  Reference,
  ResolutionErrorCode,
  ResolutionEvent,
  ResolutionEventSource,
  ResolutionReport,
  SecretRef,
  VariableRef,
} from '@agyn/shared';

export type SecretProvider = (ref: SecretRef) => Promise<string | undefined>;

export type VariableProvider = (ref: VariableRef) => Promise<string | undefined>;

export type Providers = {
  secret?: SecretProvider;
  variable?: VariableProvider;
};

export type ResolveOptions = {
  strict?: boolean;
  memoize?: boolean;
  cycleDetection?: boolean;
  maxDepth?: number;
  coerceToString?: boolean;
  report?: boolean;
  lenientUnresolvedValue?: 'keep' | 'null' | 'default';
  basePath?: string;
};

const DEFAULT_OPTIONS: Required<Omit<ResolveOptions, 'basePath' | 'lenientUnresolvedValue'>> & {
  lenientUnresolvedValue: 'keep' | 'null' | 'default';
} = {
  strict: true,
  memoize: true,
  cycleDetection: true,
  maxDepth: 100,
  coerceToString: true,
  report: true,
  lenientUnresolvedValue: 'keep',
};

const SECRET_MISSING = Symbol('secret_missing');
const VAR_MISSING = Symbol('variable_missing');

export class ResolveError extends Error {
  readonly code: ResolutionErrorCode;
  readonly path: string;
  readonly source: ResolutionEventSource;
  readonly cause?: unknown;

  constructor(
    code: ResolutionErrorCode,
    message: string,
    opts: { path: string; source: ResolutionEventSource; cause?: unknown },
  ) {
    super(message);
    this.name = 'ResolveError';
    this.code = code;
    this.path = opts.path;
    this.source = opts.source;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export type ResolveResult<T> = {
  output: T;
  report: ResolutionReport;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function isSecretRef(value: unknown): value is SecretRef {
  if (!isPlainObject(value)) return false;
  if ((value as { kind?: unknown }).kind !== 'vault') return false;
  const path = (value as { path?: unknown }).path;
  const key = (value as { key?: unknown }).key;
  return typeof path === 'string' && path.length > 0 && typeof key === 'string' && key.length > 0;
}

export function isVariableRef(value: unknown): value is VariableRef {
  if (!isPlainObject(value)) return false;
  if ((value as { kind?: unknown }).kind !== 'var') return false;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.length > 0;
}

function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function buildPointer(basePath: string | undefined, segments: string[]): string {
  const pointer = segments.length ? `/${segments.map((seg) => encodePointerSegment(seg)).join('/')}` : '';
  if (!basePath) return pointer;
  if (!pointer) return basePath;
  return `${basePath.replace(/\/$/, '')}${pointer}`;
}

function cloneReference<T extends Reference>(ref: T): T {
  return JSON.parse(JSON.stringify(ref)) as T;
}

type TraverseState = {
  options: Required<Omit<ResolveOptions, 'basePath'>> & {
    basePath?: string;
    lenientUnresolvedValue: 'keep' | 'null' | 'default';
  };
  providers: Providers;
  secretCache: Map<string, string | typeof SECRET_MISSING> | null;
  variableCache: Map<string, string | typeof VAR_MISSING> | null;
  report: ResolutionReport;
  ancestors: WeakSet<object> | null;
};

const normalizeSecretRef = (ref: SecretRef): SecretRef => ({
  kind: 'vault',
  path: ref.path,
  key: ref.key,
  ...(ref.mount ? { mount: ref.mount } : {}),
});

const normalizeVariableRef = (ref: VariableRef): VariableRef => ({
  kind: 'var',
  name: ref.name,
  ...(ref.default !== undefined ? { default: ref.default } : {}),
});

async function resolveSecretRef(
  ref: SecretRef,
  pointer: string,
  state: TraverseState,
): Promise<string | Reference | null | undefined> {
  state.report.counts.total += 1;
  const provider = state.providers.secret;
  const normalized = normalizeSecretRef(ref);
  const key = `${normalized.mount ?? ''}:${normalized.path}:${normalized.key}`;
  const cache = state.secretCache;

  if (!provider) {
    const err = new ResolveError('provider_missing', 'Secret provider is not configured', {
      path: pointer,
      source: 'secret',
    });
    recordEvent(state, {
      path: pointer,
      source: 'secret',
      cacheHit: false,
      error: { code: err.code, message: err.message },
    });
    state.report.counts.errors += 1;
    if (state.options.strict) throw err;
    state.report.counts.unresolved += 1;
    return lenientFallback('secret', ref, state.options);
  }

  const cached = cache?.get(key);
  if (cached !== undefined) {
    state.report.counts.cacheHits += 1;
    if (cached === SECRET_MISSING) {
      state.report.counts.unresolved += 1;
      recordEvent(state, {
        path: pointer,
        source: 'secret',
        cacheHit: true,
        error: { code: 'unresolved_reference', message: 'Secret reference unresolved (cached)' },
      });
      if (state.options.strict)
        throw new ResolveError('unresolved_reference', 'Secret reference unresolved', {
          path: pointer,
          source: 'secret',
        });
      return lenientFallback('secret', ref, state.options);
    }
    state.report.counts.resolved += 1;
    recordEvent(state, { path: pointer, source: 'secret', cacheHit: true, resolved: true });
    return cached;
  }

  try {
    const value = await provider(normalized);
    if (value === undefined || value === null) {
      cache?.set(key, SECRET_MISSING);
      state.report.counts.unresolved += 1;
      recordEvent(state, {
        path: pointer,
        source: 'secret',
        cacheHit: false,
        error: { code: 'unresolved_reference', message: 'Secret reference unresolved' },
      });
      if (state.options.strict) {
        throw new ResolveError('unresolved_reference', 'Secret reference could not be resolved', {
          path: pointer,
          source: 'secret',
        });
      }
      return lenientFallback('secret', ref, state.options);
    }
    const resolved = state.options.coerceToString ? String(value) : (value as string);
    cache?.set(key, resolved);
    state.report.counts.resolved += 1;
    recordEvent(state, { path: pointer, source: 'secret', cacheHit: false, resolved: true });
    return resolved;
  } catch (err: unknown) {
    if (err instanceof ResolveError) {
      state.report.counts.errors += 1;
      recordEvent(state, {
        path: pointer,
        source: 'secret',
        cacheHit: false,
        error: { code: err.code, message: err.message },
      });
      if (state.options.strict) throw err;
      state.report.counts.unresolved += 1;
      return lenientFallback('secret', ref, state.options);
    }

    const code: ResolutionErrorCode =
      typeof err === 'object' && err && 'statusCode' in err && (err as { statusCode?: number }).statusCode === 403
        ? 'permission_denied'
        : 'invalid_reference';
    const message = err instanceof Error ? err.message : 'Secret provider error';
    const resolveErr = new ResolveError(code, message, { path: pointer, source: 'secret', cause: err });
    state.report.counts.errors += 1;
    recordEvent(state, { path: pointer, source: 'secret', cacheHit: false, error: { code, message } });
    if (state.options.strict) throw resolveErr;
    state.report.counts.unresolved += 1;
    return lenientFallback('secret', ref, state.options);
  }
}

async function resolveVariableRef(
  ref: VariableRef,
  pointer: string,
  state: TraverseState,
): Promise<string | Reference | null | undefined> {
  state.report.counts.total += 1;
  const provider = state.providers.variable;
  const normalized = normalizeVariableRef(ref);
  const key = normalized.name;
  const cache = state.variableCache;

  if (!provider) {
    const err = new ResolveError('provider_missing', 'Variable provider is not configured', {
      path: pointer,
      source: 'variable',
    });
    recordEvent(state, {
      path: pointer,
      source: 'variable',
      cacheHit: false,
      error: { code: err.code, message: err.message },
    });
    state.report.counts.errors += 1;
    if (state.options.strict) throw err;
    state.report.counts.unresolved += 1;
    return lenientFallback('variable', ref, state.options);
  }

  const cached = cache?.get(key);
  if (cached !== undefined) {
    state.report.counts.cacheHits += 1;
    if (cached === VAR_MISSING) {
      state.report.counts.unresolved += 1;
      recordEvent(state, {
        path: pointer,
        source: 'variable',
        cacheHit: true,
        error: { code: 'unresolved_reference', message: 'Variable reference unresolved (cached)' },
      });
      if (state.options.strict)
        throw new ResolveError('unresolved_reference', 'Variable reference unresolved', {
          path: pointer,
          source: 'variable',
        });
      return lenientFallback('variable', ref, state.options);
    }
    state.report.counts.resolved += 1;
    recordEvent(state, { path: pointer, source: 'variable', cacheHit: true, resolved: true });
    return cached;
  }

  try {
    const value = await provider(normalized);
    if (value === undefined || value === null) {
      cache?.set(key, VAR_MISSING);
      state.report.counts.unresolved += 1;
      recordEvent(state, {
        path: pointer,
        source: 'variable',
        cacheHit: false,
        error: { code: 'unresolved_reference', message: 'Variable reference unresolved' },
      });
      if (state.options.strict) {
        throw new ResolveError('unresolved_reference', 'Variable reference could not be resolved', {
          path: pointer,
          source: 'variable',
        });
      }
      return lenientFallback('variable', ref, state.options);
    }
    const resolved = state.options.coerceToString ? String(value) : (value as string);
    cache?.set(key, resolved);
    state.report.counts.resolved += 1;
    recordEvent(state, { path: pointer, source: 'variable', cacheHit: false, resolved: true });
    return resolved;
  } catch (err: unknown) {
    if (err instanceof ResolveError) {
      state.report.counts.errors += 1;
      recordEvent(state, {
        path: pointer,
        source: 'variable',
        cacheHit: false,
        error: { code: err.code, message: err.message },
      });
      if (state.options.strict) throw err;
      state.report.counts.unresolved += 1;
      return lenientFallback('variable', ref, state.options);
    }

    const message = err instanceof Error ? err.message : 'Variable provider error';
    const resolveErr = new ResolveError('invalid_reference', message, {
      path: pointer,
      source: 'variable',
      cause: err,
    });
    state.report.counts.errors += 1;
    recordEvent(state, {
      path: pointer,
      source: 'variable',
      cacheHit: false,
      error: { code: 'invalid_reference', message },
    });
    if (state.options.strict) throw resolveErr;
    state.report.counts.unresolved += 1;
    return lenientFallback('variable', ref, state.options);
  }
}

function lenientFallback(
  kind: 'secret' | 'variable',
  ref: Reference,
  options: TraverseState['options'],
): Reference | null | undefined | string {
  switch (options.lenientUnresolvedValue) {
    case 'null':
      return null;
    case 'default':
      if (kind === 'variable') {
        const defaultValue = (ref as VariableRef).default;
        if (defaultValue !== undefined && defaultValue !== null) {
          return options.coerceToString ? String(defaultValue) : (defaultValue as string);
        }
      }
      return null;
    case 'keep':
    default:
      return cloneReference(ref);
  }
}

function recordEvent(state: TraverseState, event: ResolutionEvent): void {
  if (!state.options.report) return;
  state.report.events.push(event);
}

async function traverse(value: unknown, path: string[], depth: number, state: TraverseState): Promise<unknown> {
  if (depth > state.options.maxDepth) {
    const pointer = buildPointer(state.options.basePath, path);
    throw new ResolveError('max_depth_exceeded', `Maximum depth of ${state.options.maxDepth} exceeded`, {
      path: pointer,
      source: 'secret',
    });
  }

  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (isSecretRef(value)) {
    const pointer = buildPointer(state.options.basePath, path);
    return await resolveSecretRef(value, pointer, state);
  }
  if (isVariableRef(value)) {
    const pointer = buildPointer(state.options.basePath, path);
    return await resolveVariableRef(value, pointer, state);
  }

  if (Array.isArray(value)) {
    if (state.options.cycleDetection) {
      if (state.ancestors?.has(value)) {
        const pointer = buildPointer(state.options.basePath, path);
        throw new ResolveError('cycle_detected', 'Cycle detected during reference resolution', {
          path: pointer,
          source: 'secret',
        });
      }
      state.ancestors?.add(value);
    }
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const next = await traverse(value[i], [...path, String(i)], depth + 1, state);
      out.push(next);
    }
    if (state.options.cycleDetection) state.ancestors?.delete(value);
    return out;
  }

  if (state.options.cycleDetection) {
    if (state.ancestors?.has(value as object)) {
      const pointer = buildPointer(state.options.basePath, path);
      throw new ResolveError('cycle_detected', 'Cycle detected during reference resolution', {
        path: pointer,
        source: 'secret',
      });
    }
    state.ancestors?.add(value as object);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    const next = await traverse(v, [...path, k], depth + 1, state);
    result[k] = next;
  }
  if (state.options.cycleDetection) state.ancestors?.delete(value as object);
  return result;
}

export async function resolveReferences<T>(
  input: T,
  providers: Providers,
  options?: ResolveOptions,
): Promise<ResolveResult<T>> {
  const merged: TraverseState['options'] = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  } as TraverseState['options'];

  const secretCache = merged.memoize ? new Map<string, string | typeof SECRET_MISSING>() : null;
  const variableCache = merged.memoize ? new Map<string, string | typeof VAR_MISSING>() : null;
  const ancestors = merged.cycleDetection ? new WeakSet<object>() : null;

  const initialReport: ResolutionReport = {
    events: [],
    counts: {
      total: 0,
      resolved: 0,
      unresolved: 0,
      cacheHits: 0,
      errors: 0,
    },
  };

  const state: TraverseState = {
    options: merged,
    providers,
    secretCache,
    variableCache,
    report: initialReport,
    ancestors,
  };

  const output = (await traverse(input as unknown, [], 0, state)) as T;
  if (!merged.report) {
    return {
      output,
      report: { events: [], counts: initialReport.counts },
    };
  }
  return { output, report: initialReport };
}
