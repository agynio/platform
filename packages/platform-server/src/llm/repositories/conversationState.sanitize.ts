import { Prisma } from '@prisma/client';

import type { InputJsonValue } from '../services/messages.serialization';

const DISALLOWED_CONTROL_TEST = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DISALLOWED_CONTROL_REPLACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REPLACEMENT_CHAR = '\uFFFD';

type JsonContainer = Record<string, InputJsonValue>;

export function sanitizeStringForPostgresText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return input;
  }
  if (!DISALLOWED_CONTROL_TEST.test(input)) {
    return input;
  }
  return input.replace(DISALLOWED_CONTROL_REPLACE, REPLACEMENT_CHAR);
}

export function sanitizeJsonValueStringsForPostgres<T extends InputJsonValue>(input: T): T {
  return deepSanitize(input) as T;
}

function deepSanitize(value: InputJsonValue): InputJsonValue {
  if (value === null) {
    return value;
  }

  if (isPrismaNull(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeStringForPostgresText(value) as InputJsonValue;
  }

  if (Array.isArray(value)) {
    let mutated = false;
    const next = value.map((entry) => {
      const sanitized = deepSanitize(entry);
      if (sanitized !== entry) mutated = true;
      return sanitized;
    });
    return mutated ? (next as InputJsonValue) : value;
  }

  if (isPlainObject(value)) {
    let mutated = false;
    const clone: JsonContainer = {};
    for (const [key, inner] of Object.entries(value)) {
      const sanitized = deepSanitize(inner as InputJsonValue);
      clone[key] = sanitized;
      if (sanitized !== inner) mutated = true;
    }
    return mutated ? (clone as InputJsonValue) : value;
  }

  return value;
}

function isPlainObject(candidate: unknown): candidate is JsonContainer {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  const proto = Reflect.getPrototypeOf(candidate as Record<string, unknown>);
  return proto === Object.prototype || proto === null;
}

function isPrismaNull(value: unknown): boolean {
  return value === Prisma.DbNull || value === Prisma.JsonNull || value === Prisma.AnyNull;
}
