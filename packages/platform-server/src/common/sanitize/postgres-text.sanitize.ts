import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

const DISALLOWED_CONTROL_TEST = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DISALLOWED_CONTROL_REPLACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REPLACEMENT_CHAR = '\uFFFD';

type PlainObject = Record<string, unknown>;
type SanitizableParams = Record<string, unknown> & {
  action: Prisma.PrismaAction;
  args?: PlainObject;
};

const WRITE_TARGETS: Partial<Record<Prisma.PrismaAction, Array<'create' | 'data' | 'update' | 'where'>>> = {
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

export function registerPostgresSanitizerMiddleware(prisma: PrismaClient): void {
  prisma.$use(async (params, next) => {
    if (!isSanitizableParams(params)) {
      return next(params);
    }

    const targets = WRITE_TARGETS[params.action];
    const args = params.args;
    if (!targets || !args) {
      return next(params as Prisma.MiddlewareParams);
    }

    for (const key of targets) {
      if (Object.prototype.hasOwnProperty.call(args, key)) {
        const current = args[key];
        if (typeof current !== 'undefined') {
          args[key] = sanitizePrismaWriteInput(current);
        }
      }
    }

    return next(params as Prisma.MiddlewareParams);
  });
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

function isSanitizableParams(value: unknown): value is SanitizableParams {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const action = candidate.action;
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(WRITE_TARGETS, action)) {
    return false;
  }
  const args = (candidate as { args?: unknown }).args;
  if (typeof args === 'undefined') {
    return true;
  }
  return typeof args === 'object' && args !== null;
}
