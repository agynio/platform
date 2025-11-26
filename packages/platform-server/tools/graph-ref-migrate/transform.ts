import { SecretReferenceSchema, VariableReferenceSchema } from '../../src/utils/reference-schemas';
import type { ConversionRecord, MigrationError, TransformOutcome } from './types';

type TransformContext = {
  defaultMount: string;
};

type Pointer = readonly (string | number)[];

type MigrateOptions = {
  validate: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const escapePointerSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');

const pointerToString = (pointer: Pointer): string =>
  pointer.length === 0 ? '/' : `/${pointer.map((part) => escapePointerSegment(String(part))).join('/')}`;

const isCanonicalVaultRef = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false;
  if ((value as { kind?: unknown }).kind !== 'vault') return false;
  return SecretReferenceSchema.safeParse(value).success;
};

const isCanonicalVarRef = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false;
  if ((value as { kind?: unknown }).kind !== 'var') return false;
  return VariableReferenceSchema.safeParse(value).success;
};

type LegacyVaultRef = {
  source: 'vault';
  value: string;
};

const isLegacyVaultRef = (value: unknown): value is LegacyVaultRef =>
  isPlainObject(value) && (value as { source?: unknown }).source === 'vault' && typeof (value as { value?: unknown }).value === 'string';

type LegacyEnvRef = {
  source: 'env';
  envVar: string;
  default?: string;
};

const isLegacyEnvRef = (value: unknown): value is LegacyEnvRef =>
  isPlainObject(value) && (value as { source?: unknown }).source === 'env' && typeof (value as { envVar?: unknown }).envVar === 'string';

type LegacyStaticRef = {
  source: 'static';
  value: unknown;
};

const isLegacyStaticRef = (value: unknown): value is LegacyStaticRef =>
  isPlainObject(value) && (value as { source?: unknown }).source === 'static' && Object.prototype.hasOwnProperty.call(value, 'value');

const joinPathSegments = (segments: string[]): string => segments.join('/');

const transformValue = (input: unknown, ctx: TransformContext, pointer: Pointer): TransformOutcome => {
  const conversions: ConversionRecord[] = [];
  const errors: MigrationError[] = [];

  if (Array.isArray(input)) {
    let changed = false;
    const next: unknown[] = new Array(input.length);
    input.forEach((item, index) => {
      const child = transformValue(item, ctx, [...pointer, index]);
      if (child.changed) changed = true;
      conversions.push(...child.conversions);
      errors.push(...child.errors);
      next[index] = child.value;
    });
    return { value: changed ? next : input, changed, conversions, errors };
  }

  if (isPlainObject(input)) {
    if (isCanonicalVaultRef(input) || isCanonicalVarRef(input)) {
      return { value: input, changed: false, conversions, errors };
    }

    if (isLegacyVaultRef(input)) {
      const raw = input.value.trim();
      if (!raw) {
        errors.push({ pointer: pointerToString(pointer), message: 'Legacy vault reference is empty' });
        return { value: input, changed: false, conversions, errors };
      }
      const segments = raw.split('/').filter((segment) => segment.length > 0);
      if (segments.length < 3) {
        errors.push({ pointer: pointerToString(pointer), message: 'Legacy vault reference must include mount, path, and key segments' });
        return { value: input, changed: false, conversions, errors };
      }

      const [mount, ...rest] = segments;
      const key = rest.pop();
      if (!key) {
        errors.push({ pointer: pointerToString(pointer), message: 'Legacy vault reference missing key segment' });
        return { value: input, changed: false, conversions, errors };
      }
      const pathSegments = rest;
      if (pathSegments.length === 0) {
        errors.push({ pointer: pointerToString(pointer), message: 'Legacy vault reference missing path segment' });
        return { value: input, changed: false, conversions, errors };
      }

      const nextValue = {
        kind: 'vault' as const,
        mount,
        path: joinPathSegments(pathSegments),
        key,
      };

      if (!SecretReferenceSchema.safeParse(nextValue).success) {
        errors.push({ pointer: pointerToString(pointer), message: 'Canonical vault reference validation failed' });
        return { value: input, changed: false, conversions, errors };
      }

      conversions.push({ pointer: pointerToString(pointer), kind: 'vault', legacy: 'vault' });
      return { value: nextValue, changed: true, conversions, errors };
    }

    if (isLegacyEnvRef(input)) {
      const envVar = input.envVar.trim();
      if (!envVar) {
        errors.push({ pointer: pointerToString(pointer), message: 'Legacy env reference missing envVar' });
        return { value: input, changed: false, conversions, errors };
      }
      const nextValue = {
        kind: 'var' as const,
        name: envVar,
        ...(input.default !== undefined ? { default: input.default } : {}),
      };

      if (!VariableReferenceSchema.safeParse(nextValue).success) {
        errors.push({ pointer: pointerToString(pointer), message: 'Canonical variable reference validation failed' });
        return { value: input, changed: false, conversions, errors };
      }

      conversions.push({ pointer: pointerToString(pointer), kind: 'var', legacy: 'env' });
      return { value: nextValue, changed: true, conversions, errors };
    }

    if (isLegacyStaticRef(input)) {
      const primitive = input.value;
      if (primitive === null || ['string', 'number', 'boolean'].includes(typeof primitive)) {
        conversions.push({ pointer: pointerToString(pointer), kind: 'static', legacy: 'static' });
        return { value: primitive, changed: true, conversions, errors };
      }
      errors.push({ pointer: pointerToString(pointer), message: 'Legacy static reference must resolve to a primitive value' });
      return { value: input, changed: false, conversions, errors };
    }

    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const child = transformValue(value, ctx, [...pointer, key]);
      if (child.changed) changed = true;
      conversions.push(...child.conversions);
      errors.push(...child.errors);
      result[key] = child.value;
    }
    return { value: changed ? result : input, changed, conversions, errors };
  }

  return { value: input, changed: false, conversions, errors };
};

const collectPostTransformErrors = (value: unknown, pointer: Pointer, errors: MigrationError[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPostTransformErrors(item, [...pointer, index], errors));
    return;
  }

  if (!isPlainObject(value)) return;

  const pointerStr = pointerToString(pointer);
  if (isLegacyVaultRef(value) || isLegacyEnvRef(value) || isLegacyStaticRef(value)) {
    errors.push({ pointer: pointerStr, message: 'Legacy reference remains after migration' });
    return;
  }

  if ((value as { kind?: unknown }).kind === 'vault') {
    if (!SecretReferenceSchema.safeParse(value).success) errors.push({ pointer: pointerStr, message: 'Invalid canonical vault reference detected' });
  } else if ((value as { kind?: unknown }).kind === 'var') {
    if (!VariableReferenceSchema.safeParse(value).success) errors.push({ pointer: pointerStr, message: 'Invalid canonical variable reference detected' });
  }

  const isNodeLike = typeof (value as { id?: unknown }).id === 'string' && typeof (value as { template?: unknown }).template === 'string';
  if (isNodeLike) {
    if (Object.prototype.hasOwnProperty.call(value, 'config')) {
      const config = (value as { config?: unknown }).config;
      if (config !== undefined && !isPlainObject(config)) {
        errors.push({
          pointer: pointerToString([...pointer, 'config']),
          message: 'PersistedGraphNode.config must be an object when provided',
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(value, 'state')) {
      const state = (value as { state?: unknown }).state;
      if (state !== undefined && !isPlainObject(state)) {
        errors.push({
          pointer: pointerToString([...pointer, 'state']),
          message: 'PersistedGraphNode.state must be an object when provided',
        });
      }
    }
  }

  for (const [key, child] of Object.entries(value)) collectPostTransformErrors(child, [...pointer, key], errors);
};

export const migrateValue = (input: unknown, ctx: TransformContext, opts: MigrateOptions): TransformOutcome => {
  const transformed = transformValue(input, ctx, []);
  const validationErrors: MigrationError[] = [];
  if (opts.validate) collectPostTransformErrors(transformed.value, [], validationErrors);
  return {
    value: transformed.value,
    changed: transformed.changed,
    conversions: transformed.conversions,
    errors: [...transformed.errors, ...validationErrors],
  };
};
