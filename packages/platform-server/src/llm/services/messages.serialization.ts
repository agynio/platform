import { Prisma } from '@prisma/client';
// Use Prisma's generated JSON types for strict typing
export type JsonValue = Prisma.JsonValue;
export type InputJsonValue = Prisma.InputJsonValue;

// Internal guards
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
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
    const arr = input.map((el) => toPrismaJsonValueNullable(el));
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
