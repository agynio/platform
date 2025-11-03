import { Prisma } from '@prisma/client';

// Strongly-typed generic JSON value used in runtime code (looser than Prisma's guard)
export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

// Internal guards
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isPrismaInputJsonValue(v: unknown): v is Prisma.InputJsonValue {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) return true;
  if (Array.isArray(v)) return v.every((el) => isPrismaInputJsonValue(el));
  if (isPlainObject(v)) return Object.values(v).every((val) => isPrismaInputJsonValue(val));
  return false;
}

// Loose converter intended for runtime logging/transport where best-effort conversion is acceptable.
export function toJsonValue(input: unknown): JsonValue {
  if (input === null) return null;
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.map((el) => toJsonValue(el));
  if (isPlainObject(input)) {
    const entries = Object.entries(input).filter(([, val]) => typeof val !== 'undefined');
    return Object.fromEntries(entries.map(([k, val]) => [k, toJsonValue(val)]));
  }
  // Fallback stringify for unsupported values (functions, symbols, undefined, non-plain objects)
  return String(input);
}

// Strict converter intended for persistence (Prisma JSON). Throws on non-serializable values.
export function toPrismaJsonValue(input: unknown): Prisma.InputJsonValue {
  // Fast-path when already a valid Prisma JSON value
  if (isPrismaInputJsonValue(input)) return input as Prisma.InputJsonValue;

  // Primitive handling (including null)
  if (input === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input;

  // Arrays: convert each element to a valid Prisma.InputJsonValue
  if (Array.isArray(input)) {
    const arr = input.map((el) => toPrismaJsonValue(el));
    return arr as unknown as Prisma.InputJsonValue; // conforms to Prisma.InputJsonArray
  }

  // Plain objects: drop undefined keys and convert values
  if (isPlainObject(input)) {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'undefined') continue;
      if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
        throw new Error(`Unable to convert value to JSON: non-serializable property ${k} of type ${typeof v}`);
      }
      out[k] = toPrismaJsonValue(v);
    }
    return out as unknown as Prisma.InputJsonValue; // conforms to Prisma.InputJsonObject
  }

  // Fallback: attempt JSON normalization for other serializable inputs
  try {
    const normalized = JSON.parse(JSON.stringify(input));
    if (isPrismaInputJsonValue(normalized)) return normalized as Prisma.InputJsonValue;
  } catch {
    // ignore JSON.stringify errors
  }
  throw new Error('Unable to convert value to JSON');
}
