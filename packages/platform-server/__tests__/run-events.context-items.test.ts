import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe.sequential('RunEventsService context item persistence', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores normalized context items and preserves order with deduplication', async () => {
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
      prompt: 'inline prompt should be truncated',
      contextItems,
    });

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(callRecord.contextItemIds).toHaveLength(3);
    // Duplicate entries reuse the same persisted record
    expect(new Set(callRecord.contextItemIds).size).toBe(2);

    const storedItems = await prisma.contextItem.findMany({ where: { id: { in: callRecord.contextItemIds } } });
    expect(storedItems).toHaveLength(2);
    const byRole = Object.fromEntries(storedItems.map((item) => [item.role, item]));
    expect(byRole[ContextItemRole.system]?.contentText).toBe('system priming');
    expect(byRole[ContextItemRole.user]?.contentText).toBe('hello assistant');

    await prisma.run.delete({ where: { id: run.id } });
    await prisma.thread.delete({ where: { id: thread.id } });
    await prisma.contextItem.deleteMany({ where: { id: { in: Array.from(new Set(callRecord.contextItemIds)) } } });
  });

  it('derives context items from legacy JSON prompt when none provided explicitly', async () => {
    const { thread, run } = await createThreadAndRun();
    const promptPayload = JSON.stringify([
      { role: 'system', content: [{ type: 'input_text', text: 'system seed' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'question text' }] },
    ]);

    const event = await runEvents.startLLMCall({
      runId: run.id,
      threadId: thread.id,
      prompt: promptPayload,
    });

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(callRecord.contextItemIds).toHaveLength(2);

    const storedItems = await prisma.contextItem.findMany({ where: { id: { in: callRecord.contextItemIds } } });
    const roles = storedItems.map((item) => item.role).sort();
    expect(roles).toEqual([ContextItemRole.system, ContextItemRole.user]);

    await prisma.run.delete({ where: { id: run.id } });
    await prisma.thread.delete({ where: { id: thread.id } });
    await prisma.contextItem.deleteMany({ where: { id: { in: callRecord.contextItemIds } } });
  });

  it('falls back to single text context item when prompt is opaque', async () => {
    const { thread, run } = await createThreadAndRun();
    const rawPrompt = '  plain text prompt that cannot be parsed  ';

    const event = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, prompt: rawPrompt });

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(callRecord.contextItemIds).toHaveLength(1);

    const [item] = await prisma.contextItem.findMany({ where: { id: { in: callRecord.contextItemIds } } });
    expect(item.role).toBe(ContextItemRole.other);
    expect(item.contentText).toBe('plain text prompt that cannot be parsed');

    await prisma.run.delete({ where: { id: run.id } });
    await prisma.thread.delete({ where: { id: thread.id } });
    await prisma.contextItem.deleteMany({ where: { id: { in: callRecord.contextItemIds } } });
  });

  it('returns context items when expandContext=true and prompt preview from items', async () => {
    const { thread, run } = await createThreadAndRun();
    const contextItems = [
      { role: ContextItemRole.system, contentText: 'system overview' },
      { role: ContextItemRole.user, contentText: 'user asks a follow-up question' },
    ];
    const event = await runEvents.startLLMCall({
      runId: run.id,
      threadId: thread.id,
      prompt: 'legacy prompt text should be ignored when expandContext used',
      contextItems,
    });

    const firstPage = await runEvents.listRunEvents({ runId: run.id, limit: 10, order: 'asc' });
    expect(firstPage.items).toHaveLength(1);
    const eventWithoutContext = firstPage.items[0]!;
    expect(eventWithoutContext.llmCall?.contextItemIds).toHaveLength(2);
    expect(eventWithoutContext.llmCall?.contextItems).toBeUndefined();
    expect(eventWithoutContext.llmCall?.promptPreview).toBe('legacy prompt text should be ignored when expandContext used');

    const expanded = await runEvents.listRunEvents({ runId: run.id, limit: 10, order: 'asc', expandContext: true });
    const eventWithContext = expanded.items[0]!;
    expect(eventWithContext.llmCall?.contextItems).toHaveLength(2);
    expect(eventWithContext.llmCall?.contextItems?.[0]?.contentText).toBe('system overview');
    expect(eventWithContext.llmCall?.contextItems?.[1]?.contentText).toBe('user asks a follow-up question');
    expect(eventWithContext.llmCall?.promptPreview).toBe('system overview\nuser asks a follow-up question');

    const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
    await prisma.run.delete({ where: { id: run.id } });
    await prisma.thread.delete({ where: { id: thread.id } });
    await prisma.contextItem.deleteMany({ where: { id: { in: callRecord.contextItemIds } } });
  });
});
