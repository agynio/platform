import { PrismaClient, Prisma } from '@prisma/client';
import type { LoggerLike, ContextItemInput } from '../llm/services/context-items.utils';
import {
  buildFallbackContextItem,
  normalizeContextItems,
  parseLegacyPrompt,
  upsertNormalizedContextItems,
} from '../llm/services/context-items.utils';

export type BackfillOptions = {
  batchSize: number;
  dryRun: boolean;
  stripPrompt: boolean;
};

export type BackfillScope = {
  runIds?: string[];
};

type BatchStats = {
  processed: number;
  updated: number;
  skipped: number;
  createdItems: number;
  reusedItems: number;
  strippedPrompts: number;
};

const defaultLogger: LoggerLike = {
  info: (message, context) => console.info(`[context-items] ${message}`, context ?? {}),
  warn: (message, context) => console.warn(`[context-items] ${message}`, context ?? {}),
  debug: (message, context) => console.debug(`[context-items] ${message}`, context ?? {}),
};

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  let batchSize = 500;
  let dryRun = false;
  let stripPrompt = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--batch-size') {
      const value = args[i + 1];
      if (!value) throw new Error('Missing value for --batch-size');
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Batch size must be a positive integer');
      batchSize = parsed;
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--strip-prompt') {
      stripPrompt = true;
    } else {
      console.warn(`Unknown argument ignored: ${arg}`);
    }
  }

  return { batchSize, dryRun, stripPrompt };
}

async function fetchPendingCalls(client: PrismaClient, batchSize: number, scope?: BackfillScope) {
  const where: Prisma.LLMCallWhereInput = {
    OR: [{ contextItemIds: { isEmpty: true } }, { contextItemIds: { equals: [] } }],
  };
  if (scope?.runIds && scope.runIds.length > 0) {
    where.event = { runId: { in: scope.runIds } };
  }
  return client.lLMCall.findMany({
    where,
    orderBy: { eventId: 'asc' },
    take: batchSize,
    select: {
      eventId: true,
      prompt: true,
      contextItemIds: true,
      event: { select: { runId: true } },
    },
  });
}

function buildContextItemInputs(prompt: string | null | undefined, log: LoggerLike): ContextItemInput[] {
  const fromPrompt = parseLegacyPrompt(prompt, log);
  if (fromPrompt && fromPrompt.length > 0) return fromPrompt;
  const fallback = buildFallbackContextItem(prompt);
  return fallback ? [fallback] : [];
}

async function processDryRun(
  client: PrismaClient,
  normalized: ReturnType<typeof normalizeContextItems>,
  log: LoggerLike,
): Promise<{ ids: string[]; created: number; reused: number }> {
  if (normalized.length === 0) return { ids: [], created: 0, reused: 0 };
  const shaValues = Array.from(new Set(normalized.map((item) => item.sha256)));
  const existingRows = await client.contextItem.findMany({
    where: { sha256: { in: shaValues } },
    select: { id: true, role: true, sha256: true },
  });
  const existingMap = new Map<string, string>();
  for (const row of existingRows) existingMap.set(`${row.role}:${row.sha256}`, row.id);

  const ids: string[] = [];
  const seen = new Map<string, string>();
  let created = 0;
  let reused = 0;

  for (const item of normalized) {
    const key = `${item.role}:${item.sha256}`;
    const cached = seen.get(key);
    if (cached) {
      ids.push(cached);
      reused += 1;
      continue;
    }
    const existing = existingMap.get(key);
    if (existing) {
      seen.set(key, existing);
      ids.push(existing);
      reused += 1;
      continue;
    }
    // Placeholder ID for reporting purposes
    seen.set(key, '(new)');
    ids.push('(new)');
    created += 1;
  }

  log.debug?.('Dry-run evaluation complete', { created, reused });

  return { ids, created, reused };
}

async function processBatch(
  client: PrismaClient,
  options: BackfillOptions,
  log: LoggerLike,
  scope?: BackfillScope,
): Promise<BatchStats> {
  const calls = await fetchPendingCalls(client, options.batchSize, scope);
  const stats: BatchStats = {
    processed: calls.length,
    updated: 0,
    skipped: 0,
    createdItems: 0,
    reusedItems: 0,
    strippedPrompts: 0,
  };

  for (const call of calls) {
    const inputs = buildContextItemInputs(call.prompt, log);
    const normalized = normalizeContextItems(inputs, log);
    if (normalized.length === 0) {
      stats.skipped += 1;
      log.warn?.('No context items derived for call', { eventId: call.eventId });
      continue;
    }

    stats.updated += 1;

    if (options.dryRun) {
      const result = await processDryRun(client, normalized, log);
      stats.createdItems += result.created;
      stats.reusedItems += result.reused;
      continue;
    }

    await client.$transaction(async (tx) => {
      const result = await upsertNormalizedContextItems(tx, normalized, log);
      stats.createdItems += result.created;
      stats.reusedItems += result.reused;
      await tx.lLMCall.update({
        where: { eventId: call.eventId },
        data: {
          contextItemIds: result.ids,
          ...(options.stripPrompt ? { prompt: null } : {}),
        },
      });
      if (options.stripPrompt) stats.strippedPrompts += 1;
    });
  }

  return stats;
}

export async function runContextItemsBackfill(
  client: PrismaClient,
  options: BackfillOptions,
  log: LoggerLike = defaultLogger,
  scope?: BackfillScope,
) {
  log.info?.('Starting context items backfill', { options });

  const totals: BatchStats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    createdItems: 0,
    reusedItems: 0,
    strippedPrompts: 0,
  };

  for (;;) {
    const batch = await processBatch(client, options, log, scope);
    if (batch.processed === 0) break;

    totals.processed += batch.processed;
    totals.updated += batch.updated;
    totals.skipped += batch.skipped;
    totals.createdItems += batch.createdItems;
    totals.reusedItems += batch.reusedItems;
    totals.strippedPrompts += batch.strippedPrompts;

    log.info?.('Batch processed', {
      processed: batch.processed,
      updated: batch.updated,
      skipped: batch.skipped,
      created: batch.createdItems,
      reused: batch.reusedItems,
      strippedPrompts: batch.strippedPrompts,
    });

    if (options.dryRun) break;
  }

  log.info?.('Backfill complete', { totals, dryRun: options.dryRun });
  if (options.dryRun) log.info?.('Dry-run mode: no database updates were performed.');

  return totals;
}

async function main() {
  const options = parseArgs();
  const client = new PrismaClient();
  try {
    await runContextItemsBackfill(client, options, defaultLogger);
  } catch (err) {
    console.error('Backfill failed', err);
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
