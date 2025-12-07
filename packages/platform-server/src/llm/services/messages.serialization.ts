import { Prisma } from '@prisma/client';
// Use Prisma's generated JSON types for strict typing
export type JsonValue = Prisma.JsonValue;
export type InputJsonValue = Prisma.InputJsonValue;

const NULL_CHAR = '\u0000';
const NULL_CHAR_PATTERN = /\u0000/g;
const NULL_REPLACEMENT = '\uFFFD';

const isPrismaJsonNull = (
  value: unknown,
): value is typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull =>
  value === Prisma.JsonNull || value === Prisma.DbNull || value === Prisma.AnyNull;

// Internal guards
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === Object.prototype || proto === null;
}

function isInputJsonValue(v: unknown): v is InputJsonValue {
  if (v === Prisma.JsonNull || v === Prisma.DbNull || v === Prisma.AnyNull) return true;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.every((el) => isInputJsonValue(el));
  if (isPlainObject(v)) return Object.values(v).every((val) => isInputJsonValue(val));
  return false;
}

// Strict converter intended for persistence (Prisma JSON). Throws on non-serializable values.
export function toPrismaJsonValue(input: unknown): InputJsonValue {
  // Fast-path when already a valid JSON value
  if (isInputJsonValue(input)) return input;

  // Primitive handling (including null)
  if (input === null) throw new Error('Unable to convert value to JSON: null is not allowed');
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;

  // Arrays: convert each element
  if (Array.isArray(input)) {
    const arrInput = input as unknown[];
    const arr = arrInput.map((el: unknown) => toPrismaJsonValueNullable(el));
    return arr;
  }

  // Plain objects: drop undefined keys and convert values
  if (isPlainObject(input)) {
    const out: Record<string, InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'undefined') continue;
      if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
        throw new Error(`Unable to convert value to JSON: non-serializable property ${k} of type ${typeof v}`);
      }
      out[k] = toPrismaJsonValueNullable(v);
    }
    return out;
  }

  throw new Error('Unable to convert value to JSON');
}

function toPrismaJsonValueNullable(input: unknown): InputJsonValue | null {
  // Fast-path when already a valid JSON value
  if (isInputJsonValue(input)) return input;

  // Primitive handling (including null)
  if (input === null) return null;

  return toPrismaJsonValue(input);
}

export function sanitizeNullCharacters(value: string): string {
  return value.includes(NULL_CHAR) ? value.replace(NULL_CHAR_PATTERN, NULL_REPLACEMENT) : value;
}

export function sanitizeJsonStrings<T extends Prisma.InputJsonValue>(input: T): T {
  if (input === null) return input;
  if (isPrismaJsonNull(input)) return input;

  if (typeof input === 'string') {
    return sanitizeNullCharacters(input) as T;
  }

  if (Array.isArray(input)) {
    let mutated = false;
    const next = input.map((entry) => {
      const sanitized = sanitizeJsonStrings(entry as Prisma.InputJsonValue);
      if (sanitized !== entry) mutated = true;
      return sanitized;
    });
    return (mutated ? (next as unknown as T) : input);
  }

  if (typeof input === 'object') {
    let mutated = false;
    const record = input as Record<string, Prisma.InputJsonValue | null>;
    const entries = Object.entries(record);
    const next: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, value] of entries) {
      const sanitized = value === null ? null : sanitizeJsonStrings(value);
      if (sanitized !== value) mutated = true;
      next[key] = sanitized;
    }
    return (mutated ? (next as unknown as T) : input);
  }

  return input;
}
