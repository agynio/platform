import { ContextItemRole, Prisma } from '@prisma/client';
import { AIMessage, HumanMessage, ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { toPrismaJsonValue } from './messages.serialization';

export type ContextItemInput = {
  role?: ContextItemRole | string | null;
  contentText?: string | null;
  contentJson?: unknown;
  metadata?: unknown;
};

export type NormalizedContextItem = {
  role: ContextItemRole;
  contentText: string | null;
  contentJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  sizeBytes: number;
};

export type LoggerLike = {
  info?: (message: string, context?: Record<string, unknown>) => void;
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

const ROLE_ALIASES: Record<string, ContextItemRole> = {
  system: ContextItemRole.system,
  user: ContextItemRole.user,
  human: ContextItemRole.user,
  assistant: ContextItemRole.assistant,
  ai: ContextItemRole.assistant,
  tool: ContextItemRole.tool,
  function: ContextItemRole.tool,
  memory: ContextItemRole.memory,
  summary: ContextItemRole.summary,
  other: ContextItemRole.other,
};

export function coerceContextItemRole(value: unknown): ContextItemRole {
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().toLowerCase();
    return ROLE_ALIASES[normalized] ?? ContextItemRole.other;
  }
  if (typeof value === 'number') {
    const entries = Object.values(ContextItemRole);
    const candidate = entries.at(value);
    if (candidate) return candidate;
  }
  if (Object.values(ContextItemRole).includes(value as ContextItemRole)) return value as ContextItemRole;
  return ContextItemRole.other;
}

const NULL_CHAR = '\u0000';

type SanitizeField = 'contentText' | 'contentJson' | 'metadata' | 'payload';

function sanitizeString(
  value: string,
  logger?: LoggerLike,
  context?: { field: SanitizeField; path?: string[] },
): string {
  if (!value) return value;
  if (!value.includes(NULL_CHAR)) return value;
  const sanitized = value.split(NULL_CHAR).join('');
  logger?.warn?.('context_items.null_bytes_stripped', {
    removedLength: value.length - sanitized.length,
    field: context?.field,
    path: context?.path && context.path.length > 0 ? context.path.join('.') : undefined,
  });
  return sanitized;
}

function sanitizePrismaJson(
  value: unknown,
  logger: LoggerLike | undefined,
  field: Exclude<SanitizeField, 'contentText'>,
  path: string[] = [],
): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value, logger, { field, path });
  }

  if (Array.isArray(value)) {
    let mutated = false;
    const next = value.map((entry, index) => {
      const sanitized = sanitizePrismaJson(entry, logger, field, path.concat(String(index)));
      if (sanitized !== entry) mutated = true;
      return sanitized;
    });
    return mutated ? next : value;
  }

  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as object | null;
    const isPlain = proto === Object.prototype || proto === null;
    if (!isPlain) return value;

    let mutated = false;
    const entries = Object.entries(value as Record<string, unknown>) as Array<[string, unknown]>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      const sanitized = sanitizePrismaJson(entry, logger, field, path.concat(key));
      out[key] = sanitized;
      if (sanitized !== entry) mutated = true;
    }
    return mutated ? out : value;
  }

  return value;
}

export function normalizeContextItem(input: ContextItemInput, logger?: LoggerLike): NormalizedContextItem | null {
  const role = coerceContextItemRole(input.role);

  let text: string | null = null;
  if (typeof input.contentText === 'string') {
    text = sanitizeString(input.contentText, logger, { field: 'contentText' });
  } else if (input.contentText === null) text = null;

  const { jsonValue, canonicalJson } = normalizeJsonValue(input.contentJson, logger);
  const metadata = normalizeMetadata(input.metadata, logger);

  if (text === null && canonicalJson === null) return null;

  const textBytes = text !== null ? Buffer.byteLength(text, 'utf8') : 0;
  const jsonBytes = canonicalJson !== null ? Buffer.byteLength(JSON.stringify(canonicalJson), 'utf8') : 0;

  return {
    role,
    contentText: text,
    contentJson: jsonValue,
    metadata,
    sizeBytes: textBytes + jsonBytes,
  };
}

export function normalizeContextItems(inputs: ContextItemInput[], logger?: LoggerLike): NormalizedContextItem[] {
  const out: NormalizedContextItem[] = [];
  for (const entry of inputs) {
    const normalized = normalizeContextItem(entry, logger);
    if (normalized) out.push(normalized);
  }
  return out;
}

export type MemoryPlacement = 'after_system' | 'last_message';

type ToolCallPlainRecord = Record<string, unknown> & { output?: unknown };

function isPrismaJsonNull(value: unknown): value is typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull {
  return value === Prisma.JsonNull || value === Prisma.DbNull || value === Prisma.AnyNull;
}

export function deepSanitizeCreateData(
  data: Prisma.ContextItemCreateInput,
  logger?: LoggerLike,
): Prisma.ContextItemCreateInput {
  return sanitizeContextItemPayload(data, logger);
}

export function sanitizeContextItemPayload<TPayload>(payload: TPayload, logger?: LoggerLike): TPayload {
  if (payload === null || typeof payload !== 'object') return payload;
  const seen = new WeakMap<object, unknown>();

  const resolveField = (path: string[]): SanitizeField => {
    const root = path[0];
    if (root === 'contentText') return 'contentText';
    if (root === 'contentJson') return 'contentJson';
    if (root === 'metadata') return 'metadata';
    return 'payload';
  };

  function sanitizeValue(value: unknown, path: string[]): unknown {
    if (typeof value === 'string') {
      return sanitizeString(value, logger, { field: resolveField(path), path });
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) return seen.get(value);
      let mutated = false;
      const result: unknown[] = [];
      seen.set(value, result);
      for (let index = 0; index < value.length; index += 1) {
        const entry: unknown = value[index];
        const sanitized: unknown = sanitizeValue(entry, path.concat(String(index)));
        result[index] = sanitized;
        if (sanitized !== entry) mutated = true;
      }
      return mutated ? result : value;
    }

    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return seen.get(value as object);
      if (isPrismaJsonNull(value)) return value;

      const proto = Object.getPrototypeOf(value as object) as object | null;
      const isPlain = proto === Object.prototype || proto === null;
      if (!isPlain) return value;

      let mutated = false;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      const out: Record<string, unknown> = {};
      seen.set(value as object, out);
      for (const key of keys) {
        const entry: unknown = record[key];
        const sanitized: unknown = sanitizeValue(entry, path.concat(key));
        out[key] = sanitized;
        if (sanitized !== entry) mutated = true;
      }
      return mutated ? (out as typeof value) : value;
    }

    return value;
  }

  const source: unknown = payload;
  const nextValue = sanitizeValue(source as Record<string, unknown>, []);
  return (nextValue ?? payload) as TPayload;
}

export function contextItemInputFromSystem(message: SystemMessage): ContextItemInput {
  return {
    role: ContextItemRole.system,
    contentText: message.text,
    metadata: { type: message.type },
  };
}

export function contextItemInputFromSummary(text: string): ContextItemInput {
  return {
    role: ContextItemRole.summary,
    contentText: text,
    metadata: { kind: 'summary' },
  };
}

export function contextItemInputFromMemory(message: SystemMessage, place: MemoryPlacement): ContextItemInput {
  return {
    role: ContextItemRole.memory,
    contentText: message.text,
    metadata: { type: message.type, place },
  };
}

export function contextItemInputFromMessage(
  message: SystemMessage | HumanMessage | AIMessage | ResponseMessage | ToolCallMessage | ToolCallOutputMessage,
): ContextItemInput {
  if (message instanceof SystemMessage) return contextItemInputFromSystem(message);
  if (message instanceof HumanMessage) {
    return {
      role: ContextItemRole.user,
      contentText: message.text,
      metadata: { type: message.type },
    };
  }
  if (message instanceof AIMessage) {
    return {
      role: ContextItemRole.assistant,
      contentText: message.text,
      metadata: { type: message.type },
    };
  }
  if (message instanceof ToolCallMessage) {
    return {
      role: ContextItemRole.tool,
      metadata: { type: message.type, callId: message.callId, name: message.name, phase: 'request' },
    };
  }
  if (message instanceof ToolCallOutputMessage) {
    const plain = safeToPlain(message);
    const clonedPlain = plain && typeof plain === 'object' ? ({ ...(plain as Record<string, unknown>) } as ToolCallPlainRecord) : null;
    const rawOutput = typeof clonedPlain?.output === 'string' ? (clonedPlain.output as string) : null;

    if (typeof rawOutput === 'string' && rawOutput.includes(NULL_CHAR)) {
      const bytes = Buffer.byteLength(rawOutput, 'utf8');
      const base64 = Buffer.from(rawOutput, 'utf8').toString('base64');
      const contentJson = {
        ...(clonedPlain ?? { type: message.type, call_id: message.callId }),
        output: {
          encoding: 'base64',
          data: base64,
          bytes,
        },
      };
      return {
        role: ContextItemRole.tool,
        contentText: null,
        contentJson,
        metadata: { type: message.type, callId: message.callId, outputEncoding: 'base64', outputBytes: bytes },
      };
    }

    return {
      role: ContextItemRole.tool,
      contentText: message.text,
      contentJson: plain,
      metadata: { type: message.type, callId: message.callId },
    };
  }
  if (message instanceof ResponseMessage) {
    const text = message.text;
    const hasContent = text.trim().length > 0;
    return {
      role: ContextItemRole.assistant,
      contentText: hasContent ? text : null,
      contentJson: safeToPlain(message),
      metadata: { type: message.type },
    };
  }
  return {
    role: ContextItemRole.other,
    contentJson: safeToPlain(message) ?? null,
  };
}

function normalizeJsonValue(value: unknown, logger?: LoggerLike): {
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  canonicalJson: unknown | null;
} {
  if (value === undefined || value === null) return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  const sanitized = sanitizePrismaJson(value, logger, 'contentJson', ['contentJson']);
  try {
    const jsonValue = toPrismaJsonValue(sanitized);
    const canonicalJson = toCanonicalJson(jsonValue);
    return { jsonValue, canonicalJson };
  } catch (err) {
    logger?.warn?.('context_items.normalize_json_failed', { error: err instanceof Error ? err.message : String(err) });
    return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  }
}

function normalizeMetadata(value: unknown, logger?: LoggerLike): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const sanitized = sanitizePrismaJson(value, logger, 'metadata', ['metadata']);
  try {
    return toPrismaJsonValue(sanitized);
  } catch (err) {
    logger?.warn?.('context_items.normalize_metadata_failed', { error: err instanceof Error ? err.message : String(err) });
    return Prisma.JsonNull;
  }
}

function toCanonicalJson(value: Prisma.InputJsonValue | typeof Prisma.JsonNull): unknown {
  const maybeNull = value as unknown;
  if (maybeNull === Prisma.JsonNull || maybeNull === Prisma.DbNull || maybeNull === Prisma.AnyNull) return null;
  if (Array.isArray(value)) return value.map((entry) => toCanonicalJson(entry as Prisma.InputJsonValue));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, Prisma.InputJsonValue>).sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [key, val] of entries) out[key] = toCanonicalJson(val);
    return out;
  }
  return value;
}

function safeToPlain(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const candidate = value as { toPlain?: () => unknown };
    if (typeof candidate.toPlain === 'function') {
      try {
        return candidate.toPlain();
      } catch {
        return null;
      }
    }
  }
  return null;
}
