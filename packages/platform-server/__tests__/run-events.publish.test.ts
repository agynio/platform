import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient, ToolExecStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService, type RunTimelineEvent } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;
const maybeDescribe = shouldRunDbTests ? describe.sequential : describe.skip;

maybeDescribe('RunEventsService publishEvent broadcasting', () => {
  if (!shouldRunDbTests) return;

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const prismaService = { getClient: () => prisma } as unknown as PrismaService;
  async function createThreadAndRun() {
    const thread = await prisma.thread.create({ data: { alias: `thread-${randomUUID()}` } });
    const run = await prisma.run.create({ data: { threadId: thread.id } });
    return { thread, run };
  }

  async function cleanup(threadId: string, runId: string) {
    await prisma.run.delete({ where: { id: runId } }).catch(() => undefined);
    await prisma.thread.delete({ where: { id: threadId } }).catch(() => undefined);
  }

  let runEvents: RunEventsService;
  let eventsBus: EventsBusService;
  let events: RunEventBusPayload[];

  beforeEach(async () => {
    runEvents = new RunEventsService(prismaService);
    eventsBus = new EventsBusService(runEvents);
    events = [];
    eventsBus.subscribeToRunEvents((payload) => events.push(payload));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    events = [];
  });

  it('emits append and update payloads with tool execution data', async () => {
    const { thread, run } = await createThreadAndRun();

    try {
      const started = await runEvents.startToolExecution({
        runId: run.id,
        threadId: thread.id,
        toolName: 'search',
        toolCallId: 'call-1',
        input: { query: 'status' },
      });

      const appendEvent = await eventsBus.publishEvent(started.id, 'append');
      expect(appendEvent?.status).toBe('running');
      expect(events).toHaveLength(1);
      const appendedEvent = events[0]!;
      expect(appendedEvent.runId).toBe(run.id);
      expect(appendedEvent.mutation).toBe('append');
      const appendedSnapshot = appendedEvent.event as RunTimelineEvent;
      expect(appendedSnapshot.id).toBe(started.id);
      expect(appendedSnapshot.status).toBe('running');
      expect(appendedSnapshot.toolExecution?.toolName).toBe('search');
      expect(appendedSnapshot.toolExecution?.input).toEqual({ query: 'status' });
      expect(appendedSnapshot.toolExecution?.output).toBeNull();
      events = [];

      await runEvents.completeToolExecution({
        eventId: started.id,
        status: ToolExecStatus.success,
        output: { answer: 42 },
        raw: { latencyMs: 1200 },
      });

      const updateEvent = await eventsBus.publishEvent(started.id, 'update');
      expect(updateEvent?.status).toBe('success');
      expect(updateEvent?.toolExecution?.output).toEqual({ answer: 42 });
      expect(events).toHaveLength(1);
      const updatedPayload = events[0]!;
      expect(updatedPayload.runId).toBe(run.id);
      expect(updatedPayload.mutation).toBe('update');
      const updatedEvent = updatedPayload.event as RunTimelineEvent;
      expect(updatedEvent.status).toBe('success');
      expect(updatedEvent.toolExecution?.execStatus).toBe('success');
      expect(updatedEvent.toolExecution?.output).toEqual({ answer: 42 });
      expect(updatedEvent.toolExecution?.raw).toEqual({ latencyMs: 1200 });
      expect(updatedEvent.toolExecution?.errorMessage).toBeNull();
    } finally {
      await cleanup(thread.id, run.id);
    }
  });
});
