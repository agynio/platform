import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, RunEventType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { LoggerLike } from '../src/llm/services/context-items.utils';
import { runContextItemsBackfill, type BackfillOptions } from '../src/scripts/backfill_context_items';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
if (!databaseUrl) throw new Error('AGENTS_DATABASE_URL must be set for scripts.backfill_context_items.test.ts');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const logStub: LoggerLike = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

async function createThreadAndRun() {
  const thread = await prisma.thread.create({ data: { alias: `ctx-thread-${randomUUID()}` } });
  const run = await prisma.run.create({ data: { threadId: thread.id } });
  return { thread, run };
}

async function createLegacyLLMCall(runId: string, threadId: string, ordinal: number, prompt: string) {
  const event = await prisma.runEvent.create({
    data: {
      runId,
      threadId,
      type: RunEventType.llm_call,
      ordinal,
    },
  });
  await prisma.lLMCall.create({
    data: {
      eventId: event.id,
      prompt,
      contextItemIds: [],
    },
  });
  return event.id;
}

async function cleanupRun(threadId: string, runId: string, contextItemIds: string[] = []) {
  await prisma.run.delete({ where: { id: runId } });
  await prisma.thread.delete({ where: { id: threadId } });
  if (contextItemIds.length > 0) {
    await prisma.contextItem.deleteMany({ where: { id: { in: Array.from(new Set(contextItemIds)) } } });
  }
}

describe.sequential('context-items backfill script', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dry-run leaves legacy prompts untouched', async () => {
    const { thread, run } = await createThreadAndRun();
    const uniquePrompt = `dry-run-prompt-${randomUUID()}`;
    const eventId = await createLegacyLLMCall(run.id, thread.id, 0, uniquePrompt);

    const beforeIds = (await prisma.lLMCall.findUniqueOrThrow({ where: { eventId } })).contextItemIds;
    expect(beforeIds).toHaveLength(0);

    const options: BackfillOptions = { batchSize: 10, dryRun: true, stripPrompt: false };
    const totals = await runContextItemsBackfill(prisma, options, logStub, { runIds: [run.id] });
    expect(totals.processed).toBe(1);
    expect(totals.updated).toBe(1);
    expect(totals.createdItems).toBe(1); // dry-run counts prospective creations

    const afterCall = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId } });
    expect(afterCall.contextItemIds).toHaveLength(0);
    const ctxItem = await prisma.contextItem.findFirst({ where: { contentText: uniquePrompt.trim() } });
    expect(ctxItem).toBeNull();

    await cleanupRun(thread.id, run.id);
  });

  it('populates context items, strips prompts when requested, and is idempotent', async () => {
    const { thread, run } = await createThreadAndRun();
    const sharedTextA = `shared-system-${randomUUID()}`;
    const sharedTextB = `shared-user-${randomUUID()}`;
    const legacyPromptJson = JSON.stringify([
      { role: 'system', content: [{ type: 'input_text', text: sharedTextA }] },
      { role: 'user', content: [{ type: 'input_text', text: sharedTextB }] },
    ]);
    const fallbackPrompt = `fallback-plain-${randomUUID()}`;

    const eventA = await createLegacyLLMCall(run.id, thread.id, 0, legacyPromptJson);
    const eventB = await createLegacyLLMCall(run.id, thread.id, 1, legacyPromptJson);
    const eventC = await createLegacyLLMCall(run.id, thread.id, 2, fallbackPrompt);

    const options: BackfillOptions = { batchSize: 2, dryRun: false, stripPrompt: true };
    const totals = await runContextItemsBackfill(prisma, options, logStub, { runIds: [run.id] });

    expect(totals.processed).toBe(3);
    expect(totals.updated).toBe(3);
    expect(totals.createdItems).toBe(3);
    expect(totals.reusedItems).toBe(2); // second legacy prompt reuses two items
    expect(totals.strippedPrompts).toBe(3);

    const callA = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: eventA } });
    const callB = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: eventB } });
    const callC = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: eventC } });

    expect(callA.contextItemIds).toHaveLength(2);
    expect(callB.contextItemIds).toEqual(callA.contextItemIds);
    expect(callC.contextItemIds).toHaveLength(1);
    expect(callA.prompt).toBeNull();
    expect(callB.prompt).toBeNull();
    expect(callC.prompt).toBeNull();

    const storedTexts = await prisma.contextItem.findMany({
      where: { id: { in: [...callA.contextItemIds, ...callC.contextItemIds] } },
      select: { id: true, contentText: true },
    });
    const texts = storedTexts.map((entry) => entry.contentText).sort();
    expect(texts).toEqual([fallbackPrompt, sharedTextA, sharedTextB].sort());

    // Second pass should keep state unchanged and report no work
    const repeatTotals = await runContextItemsBackfill(prisma, options, logStub, { runIds: [run.id] });
    expect(repeatTotals.processed).toBe(0);
    expect(repeatTotals.createdItems).toBe(0);

    await cleanupRun(thread.id, run.id, [...callA.contextItemIds, ...callC.contextItemIds]);
  });
});
