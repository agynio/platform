import type { PrismaClient } from '@prisma/client';
import { ContextItemRole, Prisma } from '@prisma/client';
import { AIMessage, HumanMessage, ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { sanitizeJsonStrings, toPrismaJsonValue } from './messages.serialization';

export type ContextItemInput = {
  role?: ContextItemRole | string | null;
  contentText?: string | null;
  contentJson?: unknown;
  metadata?: unknown;
};

export type NormalizedContextItem = {
  role: ContextItemRole;
  contentText: string | null;
  contentJson: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull;
  metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull;
  sizeBytes: number;
};

export type LoggerLike = {
  info?: (message: string, context?: Record<string, unknown>) => void;
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

const sanitizeText = (value: string): string => value.replace(/\u0000/g, '\uFFFD');

const sanitizeJsonValue = (
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull => {
  if (value === Prisma.JsonNull) return value;
  if (value === Prisma.DbNull) return value;
  if (value === Prisma.AnyNull) return value;
  return sanitizeJsonStrings(value as Prisma.InputJsonValue);
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

export function normalizeContextItem(input: ContextItemInput, logger?: LoggerLike): NormalizedContextItem | null {
  const role = coerceContextItemRole(input.role);

  let text: string | null = null;
  if (typeof input.contentText === 'string') text = sanitizeText(input.contentText);
  else if (input.contentText === null) text = null;

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

type PrismaContextClient = PrismaClient | Prisma.TransactionClient;

export type UpsertContextItemsResult = {
  ids: string[];
  created: number;
};

export type MemoryPlacement = 'after_system' | 'last_message';

export async function upsertNormalizedContextItems(
  client: PrismaContextClient,
  items: NormalizedContextItem[],
  logger?: LoggerLike,
): Promise<UpsertContextItemsResult> {
  const ids: string[] = [];
  let created = 0;

  for (const item of items) {
    try {
      const sanitizedText = typeof item.contentText === 'string' ? sanitizeText(item.contentText) : item.contentText;
      const sanitizedContentJson = sanitizeJsonValue(item.contentJson) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
      const sanitizedMetadata = sanitizeJsonValue(item.metadata) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

      const createdRecord = await client.contextItem.create({
        data: {
          role: item.role,
          contentText: sanitizedText,
          contentJson: sanitizedContentJson,
          metadata: sanitizedMetadata,
          sizeBytes: item.sizeBytes,
        },
        select: { id: true },
      });
      ids.push(createdRecord.id);
      created += 1;
    } catch (err) {
      logger?.warn?.('context_items.upsert_failed', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return { ids, created };
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
    return {
      role: ContextItemRole.tool,
      contentText: message.text,
      contentJson: safeToPlain(message),
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
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull;
  canonicalJson: unknown | null;
} {
  if (value === undefined || value === null) return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  try {
    const jsonValue = sanitizeJsonValue(toPrismaJsonValue(value));
    const canonicalJson = toCanonicalJson(jsonValue);
    return { jsonValue, canonicalJson };
  } catch (err) {
    logger?.warn?.('context_items.normalize_json_failed', { error: err instanceof Error ? err.message : String(err) });
    return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  }
}

function normalizeMetadata(value: unknown, logger?: LoggerLike): Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  try {
    return sanitizeJsonValue(toPrismaJsonValue(value));
  } catch (err) {
    logger?.warn?.('context_items.normalize_metadata_failed', { error: err instanceof Error ? err.message : String(err) });
    return Prisma.JsonNull;
  }
}

function toCanonicalJson(
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull | typeof Prisma.AnyNull,
): unknown {
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
