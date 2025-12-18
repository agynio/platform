import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient, ContextItemRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';
import type { ContextItemInput } from '../src/llm/services/context-items.utils';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

if (!shouldRunDbTests) {
  describe.skip('RunEventsService context item persistence', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const prismaService = { getClient: () => prisma } as unknown as PrismaService;
  const runEvents = new RunEventsService(prismaService);

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

  async function createContextItems(entries: ContextItemInput[]): Promise<string[]> {
    return runEvents.createContextItems(entries);
  }

  describe.sequential('RunEventsService context item persistence', () => {
    beforeEach(async () => {
      await prisma.contextItem.deleteMany({});
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('uses provided context item ids without creating additional rows', async () => {
      const { thread, run } = await createThreadAndRun();
      const [systemId, userId] = await createContextItems([
        { role: ContextItemRole.system, contentText: 'system priming' },
        { role: ContextItemRole.user, contentText: 'hello assistant' },
      ]);
      const beforeCount = await prisma.contextItem.count();

      const event = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        provider: 'openai',
        model: 'gpt-test',
        contextItemIds: [systemId, userId],
      });

      const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
      expect(callRecord.contextItemIds).toEqual([systemId, userId]);
      const relationRows = await prisma.lLMCallContextItem.findMany({
        where: { llmCallEventId: event.id },
        orderBy: { idx: 'asc' },
      });
      expect(relationRows.map((row) => row.contextItemId)).toEqual([systemId, userId]);
      expect(relationRows.every((row) => row.direction === 'input')).toBe(true);

      const afterCount = await prisma.contextItem.count();
      expect(afterCount).toBe(beforeCount);

      await cleanup(thread.id, run.id, [systemId, userId]);
    });

    it('appends new context item ids after reusing an existing prefix', async () => {
      const { thread, run } = await createThreadAndRun();
      const initialIds = await createContextItems([
        { role: ContextItemRole.system, contentText: 'system overview' },
        { role: ContextItemRole.user, contentText: 'initial question' },
      ]);

      const firstEvent = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: initialIds,
      });
      const first = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: firstEvent.id } });
      expect(first.contextItemIds).toEqual(initialIds);

      const appendedIds = await createContextItems([
        { role: ContextItemRole.assistant, contentText: 'assistant reply' },
        { role: ContextItemRole.user, contentText: 'follow up question' },
      ]);

      const combined = [...initialIds, ...appendedIds];
      const secondEvent = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: combined,
      });

      const second = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: secondEvent.id } });
      expect(second.contextItemIds).toEqual(combined);

      await cleanup(thread.id, run.id, combined);
    });

    it('preserves ordering and distinct ids for duplicates within a single call', async () => {
      const { thread, run } = await createThreadAndRun();
      const duplicateInputs = [
        { role: ContextItemRole.user, contentText: 'repeat me' },
        { role: ContextItemRole.user, contentText: 'repeat me' },
      ];
      const ids = await Promise.all(duplicateInputs.map((item) => createContextItems([item]))).then((chunks) =>
        chunks.flat(),
      );

      const event = await runEvents.startLLMCall({ runId: run.id, threadId: thread.id, contextItemIds: ids });
      const record = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });

      expect(record.contextItemIds).toEqual(ids);
      expect(new Set(record.contextItemIds).size).toBe(ids.length);

      await cleanup(thread.id, run.id, ids);
    });

    it('returns context item ids and resolves payloads via batch endpoint', async () => {
      const { thread, run } = await createThreadAndRun();
      const contextItems = [
        { role: ContextItemRole.system, contentText: 'system overview' },
        { role: ContextItemRole.user, contentText: 'user asks a follow-up question' },
      ];

      const ids = await createContextItems(contextItems);

      const event = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: ids,
      });

      const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });

      const firstPage = await runEvents.listRunEvents({ runId: run.id, limit: 10, order: 'asc' });
      expect(firstPage.items).toHaveLength(1);
      const summaryEvent = firstPage.items[0]!;
      expect(summaryEvent.llmCall).toBeDefined();
      const relation = summaryEvent.llmCall?.inputContextItems ?? [];
      expect(relation.map((row) => row.contextItemId)).toEqual(callRecord.contextItemIds);
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

    it('marks only new prompt entries when serializing input context items', async () => {
      const { thread, run } = await createThreadAndRun();
      const ids = await createContextItems([
        { role: ContextItemRole.system, contentText: 'sys prompt' },
        { role: ContextItemRole.user, contentText: 'latest user input' },
        { role: ContextItemRole.assistant, contentText: 'prior assistant output' },
      ]);

      const [systemId, userId, assistantId] = ids;
      const event = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: [systemId, userId, assistantId],
        newContextItemIds: [userId],
      });

      const callRecord = await prisma.lLMCall.findUniqueOrThrow({ where: { eventId: event.id } });
      expect(callRecord.newContextItemCount).toBe(1);

      const snapshot = await runEvents.getEventSnapshot(event.id);
      const contextRows = snapshot?.llmCall?.inputContextItems ?? [];
      expect(contextRows).toHaveLength(3);
      expect(contextRows.map((row) => row.contextItemId)).toEqual([systemId, userId, assistantId]);
      expect(contextRows.filter((row) => row.isNew).map((row) => row.contextItemId)).toEqual([userId]);

      await cleanup(thread.id, run.id, Array.from(new Set(ids)));
    });

    it('promotes outputs from call N into call N+1 inputs', async () => {
      const { thread, run } = await createThreadAndRun();
      const createdIds = new Set<string>();

      const [systemId, userOneId] = await createContextItems([
        { role: ContextItemRole.system, contentText: 'system guardrails' },
        { role: ContextItemRole.user, contentText: 'question #1' },
      ]);
      [systemId, userOneId].forEach((id) => createdIds.add(id));

      const firstEvent = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: [systemId, userOneId],
        newContextItemIds: [userOneId],
      });

      const [assistantOneId, toolOneId] = await createContextItems([
        { role: ContextItemRole.assistant, contentText: 'answer #1' },
        { role: ContextItemRole.tool, contentText: 'tool output #1' },
      ]);
      [assistantOneId, toolOneId].forEach((id) => createdIds.add(id));

      const [userTwoId] = await createContextItems([{ role: ContextItemRole.user, contentText: 'question #2' }]);
      createdIds.add(userTwoId);

      const secondEvent = await runEvents.startLLMCall({
        runId: run.id,
        threadId: thread.id,
        contextItemIds: [systemId, userOneId, assistantOneId, toolOneId, userTwoId],
        newContextItemIds: [assistantOneId, toolOneId, userTwoId],
      });

      const [assistantTwoId] = await createContextItems([{ role: ContextItemRole.assistant, contentText: 'answer #2' }]);
      createdIds.add(assistantTwoId);

      const timeline = await runEvents.listRunEvents({ runId: run.id, limit: 10, order: 'asc' });
      const llmEvents = timeline.items.filter((item) => item.llmCall);
      expect(llmEvents).toHaveLength(2);
      const [firstSummary, secondSummary] = llmEvents;

      const firstInputs = firstSummary.llmCall?.inputContextItems ?? [];
      const secondInputs = secondSummary.llmCall?.inputContextItems ?? [];
      expect(firstInputs.map((row) => row.contextItemId)).toEqual([systemId, userOneId]);
      expect(secondInputs.map((row) => row.contextItemId)).toEqual([
        systemId,
        userOneId,
        assistantOneId,
        toolOneId,
        userTwoId,
      ]);

      expect(secondInputs.find((row) => row.contextItemId === assistantTwoId)).toBeUndefined();

      expect(secondInputs.filter((row) => row.isNew).map((row) => row.contextItemId)).toEqual([
        assistantOneId,
        toolOneId,
        userTwoId,
      ]);

      await cleanup(thread.id, run.id, Array.from(createdIds));
    });
  });
}
