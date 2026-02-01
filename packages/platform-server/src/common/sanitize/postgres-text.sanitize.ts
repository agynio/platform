import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

const DISALLOWED_CONTROL_TEST = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DISALLOWED_CONTROL_REPLACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REPLACEMENT_CHAR = '\uFFFD';

type PlainObject = Record<string, unknown>;

type WriteTargetKey = 'create' | 'data' | 'update' | 'where';

const WRITE_TARGETS: Partial<Record<Prisma.PrismaAction, WriteTargetKey[]>> = {
  create: ['data'],
  createMany: ['data'],
  createManyAndReturn: ['data'],
  update: ['data', 'where'],
  updateMany: ['data', 'where'],
  upsert: ['create', 'update', 'where'],
  delete: ['where'],
  deleteMany: ['where'],
};

export function sanitizeStringForPostgres(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  if (!DISALLOWED_CONTROL_TEST.test(input)) {
    return input;
  }
  return input.replace(DISALLOWED_CONTROL_REPLACE, REPLACEMENT_CHAR);
}

export function sanitizeJsonForPostgres<T>(input: T): T {
  return deepSanitize(input) as T;
}

export function sanitizePrismaWriteInput<T>(input: T): T {
  return deepSanitize(input) as T;
}

export function registerPostgresSanitizerMiddleware(prisma: PrismaClient): PrismaClient {
  return prisma.$extends({
    name: 'postgres-write-sanitizer',
    query: {
      $allModels: {
        async $allOperations({ args, operation, query }) {
          const sanitizedArgs = sanitizeWriteArgs(args, operation as Prisma.PrismaAction);
          return query(sanitizedArgs);
        },
      },
    },
  }) as PrismaClient;
}

function sanitizeWriteArgs<T>(args: T, action: Prisma.PrismaAction): T {
  if (!args || typeof args !== 'object') {
    return args;
  }

  const targets = WRITE_TARGETS[action];
  if (!targets || targets.length === 0) {
    return args;
  }

  let mutatedArgs: PlainObject | undefined;
  for (const key of targets) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) {
      continue;
    }
    const current = (args as PlainObject)[key];
    if (typeof current === 'undefined') {
      continue;
    }
    const sanitized = sanitizePrismaWriteInput(current);
    if (sanitized !== current) {
      mutatedArgs ??= { ...(args as PlainObject) };
      mutatedArgs[key] = sanitized;
    }
  }

  return (mutatedArgs ?? args) as T;
}

function deepSanitize(input: unknown): unknown {
  if (input == null) {
    return input;
  }

  if (isPrismaNull(input)) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeStringForPostgres(input);
  }

  if (Array.isArray(input)) {
    let mutated = false;
    const next = input.map((entry) => {
      const sanitized = deepSanitize(entry);
      if (sanitized !== entry) mutated = true;
      return sanitized;
    });
    return mutated ? next : input;
  }

  if (isPlainObject(input)) {
    let mutated = false;
    const clone: PlainObject = {};
    for (const [key, value] of Object.entries(input)) {
      const sanitized = deepSanitize(value);
      clone[key] = sanitized;
      if (sanitized !== value) mutated = true;
    }
    return mutated ? clone : input;
  }

  return input;
}

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Reflect.getPrototypeOf(value as Record<string, unknown>);
  return proto === Object.prototype || proto === null;
}

function isPrismaNull(value: unknown): boolean {
  return value === Prisma.DbNull || value === Prisma.JsonNull || value === Prisma.AnyNull;
}
