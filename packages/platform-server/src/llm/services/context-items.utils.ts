import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ContextItemRole, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
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
  sha256: string;
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

export function normalizeContextItem(input: ContextItemInput, logger?: LoggerLike): NormalizedContextItem | null {
  const role = coerceContextItemRole(input.role);

  let text: string | null = null;
  if (typeof input.contentText === 'string') text = input.contentText;
  else if (input.contentText === null) text = null;

  const { jsonValue, canonicalJson } = normalizeJsonValue(input.contentJson, logger);
  const metadata = normalizeMetadata(input.metadata, logger);

  if (text === null && canonicalJson === null) return null;

  const textBytes = text !== null ? Buffer.byteLength(text, 'utf8') : 0;
  const jsonBytes = canonicalJson !== null ? Buffer.byteLength(JSON.stringify(canonicalJson), 'utf8') : 0;
  const payload = {
    role,
    contentText: text,
    contentJson: canonicalJson,
  } satisfies Record<string, unknown>;
  const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  return {
    role,
    contentText: text,
    contentJson: jsonValue,
    metadata,
    sizeBytes: textBytes + jsonBytes,
    sha256,
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
  reused: number;
};

export async function upsertNormalizedContextItems(
  client: PrismaContextClient,
  items: NormalizedContextItem[],
  logger?: LoggerLike,
): Promise<UpsertContextItemsResult> {
  const ids: string[] = [];
  const cache = new Map<string, string>();
  let created = 0;
  let reused = 0;

  for (const item of items) {
    const key = `${item.role}:${item.sha256}`;
    const cached = cache.get(key);
    if (cached) {
      ids.push(cached);
      reused += 1;
      continue;
    }

    const existing = await client.contextItem.findUnique({
      where: { sha256_role: { sha256: item.sha256, role: item.role } },
      select: { id: true },
    });
    if (existing) {
      cache.set(key, existing.id);
      ids.push(existing.id);
      reused += 1;
      continue;
    }

    try {
      const createdRecord = await client.contextItem.create({
        data: {
          role: item.role,
          contentText: item.contentText,
          contentJson: item.contentJson,
          metadata: item.metadata,
          sizeBytes: item.sizeBytes,
          sha256: item.sha256,
        },
        select: { id: true },
      });
      cache.set(key, createdRecord.id);
      ids.push(createdRecord.id);
      created += 1;
    } catch (err) {
      const fallbackId = await resolveUniqueConstraintConflict(err, client, item);
      if (fallbackId) {
        cache.set(key, fallbackId);
        ids.push(fallbackId);
        reused += 1;
        continue;
      }
      logger?.warn?.('context_items.upsert_failed', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return { ids, created, reused };
}

async function resolveUniqueConstraintConflict(
  err: unknown,
  client: PrismaContextClient,
  item: NormalizedContextItem,
): Promise<string | null> {
  if (!(err instanceof PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const fallback = await client.contextItem.findUnique({
    where: { sha256_role: { sha256: item.sha256, role: item.role } },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export function parseLegacyPrompt(prompt: string | null | undefined, logger?: LoggerLike): ContextItemInput[] | null {
  if (!prompt) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(prompt);
  } catch (err) {
    logger?.debug?.('context_items.parse_legacy_failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items: ContextItemInput[] = [];
  for (const entry of parsed) {
    const candidate = coerceLegacyEntry(entry);
    if (candidate) items.push(candidate);
  }
  return items.length > 0 ? items : null;
}

export function buildFallbackContextItem(prompt: string | null | undefined): ContextItemInput | null {
  if (!prompt) return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;
  return {
    role: ContextItemRole.other,
    contentText: trimmed,
  };
}

function normalizeJsonValue(value: unknown, logger?: LoggerLike): {
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  canonicalJson: unknown | null;
} {
  if (value === undefined || value === null) return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  try {
    const jsonValue = toPrismaJsonValue(value);
    const canonicalJson = toCanonicalJson(jsonValue);
    return { jsonValue, canonicalJson };
  } catch (err) {
    logger?.warn?.('context_items.normalize_json_failed', { error: err instanceof Error ? err.message : String(err) });
    return { jsonValue: Prisma.JsonNull, canonicalJson: null };
  }
}

function normalizeMetadata(value: unknown, logger?: LoggerLike): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  try {
    return toPrismaJsonValue(value);
  } catch (err) {
    logger?.warn?.('context_items.normalize_metadata_failed', { error: err instanceof Error ? err.message : String(err) });
    return Prisma.JsonNull;
  }
}

function toCanonicalJson(value: Prisma.InputJsonValue | typeof Prisma.JsonNull): unknown {
  if (value === Prisma.JsonNull || value === Prisma.DbNull || value === Prisma.AnyNull) return null;
  if (Array.isArray(value)) return value.map((entry) => toCanonicalJson(entry as Prisma.InputJsonValue));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, Prisma.InputJsonValue>).sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [key, val] of entries) out[key] = toCanonicalJson(val);
    return out;
  }
  return value;
}

function coerceLegacyEntry(entry: unknown): ContextItemInput | null {
  if (typeof entry === 'string') {
    return { role: ContextItemRole.other, contentText: entry };
  }
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const role = coerceContextItemRole(obj.role);
  const text = extractTextFromLegacy(obj);
  const metadata = typeof obj.metadata === 'object' && obj.metadata !== null ? obj.metadata : undefined;
  if (text !== null) {
    return { role, contentText: text, metadata };
  }
  return { role, contentJson: obj, metadata };
}

function extractTextFromLegacy(obj: Record<string, unknown>): string | null {
  if (typeof obj.text === 'string' && obj.text.length > 0) return obj.text;
  const texts: string[] = [];
  collectTexts(obj.content, texts);
  if (texts.length > 0) return texts.join('\n');
  if (typeof obj.output_text === 'string' && obj.output_text.length > 0) return obj.output_text;
  return null;
}

function collectTexts(value: unknown, sink: string[]): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string') {
    if (value.length > 0) sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectTexts(entry, sink);
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text.length > 0) sink.push(obj.text);
    if (Array.isArray(obj.content)) collectTexts(obj.content, sink);
  }
}
