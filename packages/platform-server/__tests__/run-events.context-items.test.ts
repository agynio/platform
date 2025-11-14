import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, ContextItemRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';
import { RunEventsService } from '../src/events/run-events.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
if (!databaseUrl) throw new Error('AGENTS_DATABASE_URL must be set for run-events.context-items.test.ts');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const prismaService = { getClient: () => prisma } as unknown as PrismaService;
const logger = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as LoggerService;

const runEvents = new RunEventsService(prismaService, logger, new NoopGraphEventsPublisher());

async function createThreadAndRun() {
  const thread = await prisma.thread.create({ data: { alias: `thread-${randomUUID()}` } });
  const run = await prisma.run.create({ data: { threadId: thread.id } });
  return { thread, run };
}

async function cleanup(threadId: string, runId: string, contextItemIds: string[] = []) {
  await prisma.run.delete({ where: { id: runId } });
  await prisma.thread.delete({ where: { id: threadId } });
  if (contextItemIds.length > 0) {
    await prisma.contextItem.deleteMany({ where: { id: { in: contextItemIds } } });
  }
}

describe.sequential('RunEventsService context item persistence', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates distinct context item rows for duplicates within a single call and preserves order', async () => {
    const { thread, run } = await createThreadAndRun();
    const contextItems = [
      { role: ContextItemRole.system, contentText: 'system priming' },
      { role: ContextItemRole.user, contentText: 'hello assistant' },
      { role: ContextItemRole.user, contentText: 'hello assistant' },
    ];

    const event = await runEvents.startLLMCall({
      runId: run.id,
      threadId: thread.id,
      provider: 'openai',
      model: 'gpt-test',
      contextItems,
    });

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(callRecord.contextItemIds).toHaveLength(3);
    expect(new Set(callRecord.contextItemIds).size).toBe(3);

    const stored = await prisma.contextItem.findMany({ where: { id: { in: callRecord.contextItemIds } } });
    const orderedTexts = callRecord.contextItemIds.map((id) => stored.find((item) => item.id === id)?.contentText ?? null);
    expect(orderedTexts).toEqual(['system priming', 'hello assistant', 'hello assistant']);

    await cleanup(thread.id, run.id, Array.from(new Set(callRecord.contextItemIds)));
  });

  it('reuses context item ids across sequential calls when the messages are identical', async () => {
    const { thread, run } = await createThreadAndRun();
    const contextItems = [
      { role: ContextItemRole.system, contentText: 'system priming' },
      { role: ContextItemRole.user, contentText: 'follow up question' },
    ];

    const firstEvent = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, contextItems });
    const secondEvent = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, contextItems });

    const first = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: firstEvent.id } });
    const second = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: secondEvent.id } });

    expect(second.contextItemIds).toEqual(first.contextItemIds);

    await cleanup(thread.id, run.id, Array.from(new Set(first.contextItemIds)));
  });

  it('appends new context item ids after reusing the existing prefix and keeps ordering stable', async () => {
    const { thread, run } = await createThreadAndRun();
    const initialItems = [
      { role: ContextItemRole.system, contentText: 'system overview' },
      { role: ContextItemRole.user, contentText: 'initial question' },
    ];
    const appendedItems = [
      ...initialItems,
      { role: ContextItemRole.assistant, contentText: 'assistant reply' },
      { role: ContextItemRole.user, contentText: 'follow up question' },
    ];

    const firstEvent = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, contextItems: initialItems });
    const secondEvent = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, contextItems: appendedItems });

    const first = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: firstEvent.id } });
    const second = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: secondEvent.id } });

    expect(first.contextItemIds).toHaveLength(initialItems.length);
    expect(second.contextItemIds).toHaveLength(appendedItems.length);
    expect(second.contextItemIds.slice(0, initialItems.length)).toEqual(first.contextItemIds);

    const newIds = second.contextItemIds.slice(initialItems.length);
    expect(newIds).toHaveLength(appendedItems.length - initialItems.length);
    for (const id of newIds) expect(first.contextItemIds).not.toContain(id);

    const stored = await prisma.contextItem.findMany({ where: { id: { in: second.contextItemIds } } });
    const orderedTexts = second.contextItemIds.map((id) => stored.find((item) => item.id === id)?.contentText ?? null);
    expect(orderedTexts).toEqual(appendedItems.map((item) => item.contentText ?? null));

    const uniqueIds = Array.from(new Set([...first.contextItemIds, ...second.contextItemIds]));
    await cleanup(thread.id, run.id, uniqueIds);
  });

  it('returns context item ids and resolves payloads via batch endpoint', async () => {
    const { thread, run } = await createThreadAndRun();
    const contextItems = [
      { role: ContextItemRole.system, contentText: 'system overview' },
      { role: ContextItemRole.user, contentText: 'user asks a follow-up question' },
    ];

    const event = await runEvents.startLLMCall({
      runId: run.id,
      threadId: thread.id,
      contextItems,
    });

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });

    const firstPage = await runEvents.listRunEvents({ runId: run.id, limit: 10, order: 'asc' });
    expect(firstPage.items).toHaveLength(1);
    const summaryEvent = firstPage.items[0]!;
    expect(summaryEvent.llmCall).toBeDefined();
    expect(summaryEvent.llmCall?.contextItemIds).toEqual(callRecord.contextItemIds);
    expect(summaryEvent.llmCall).not.toHaveProperty('contextItems');
    expect(summaryEvent.llmCall).not.toHaveProperty('prompt');
    expect(summaryEvent.llmCall).not.toHaveProperty('promptPreview');

    const resolved = await runEvents.getContextItems(callRecord.contextItemIds);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((item) => item.contentText)).toEqual([
      'system overview',
      'user asks a follow-up question',
    ]);

    await cleanup(thread.id, run.id, Array.from(new Set(callRecord.contextItemIds)));
  });
});
