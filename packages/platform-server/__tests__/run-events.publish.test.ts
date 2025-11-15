import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient, ToolExecStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';
import { RunEventsService, type RunTimelineEvent } from '../src/events/run-events.service';
import { NoopGraphEventsPublisher, type RunEventBroadcast } from '../src/gateway/graph.events.publisher';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
if (!databaseUrl) throw new Error('AGENTS_DATABASE_URL must be set for run-events.publish.test.ts');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const prismaService = { getClient: () => prisma } as unknown as PrismaService;
const logger = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as LoggerService;

type CapturedEvent = { runId: string; threadId: string; payload: RunEventBroadcast };

class CapturingPublisher extends NoopGraphEventsPublisher {
  public events: CapturedEvent[] = [];

  override emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast): void {
    this.events.push({ runId, threadId, payload });
  }

  clear() {
    this.events = [];
  }
}

async function createThreadAndRun() {
  const thread = await prisma.thread.create({ data: { alias: `thread-${randomUUID()}` } });
  const run = await prisma.run.create({ data: { threadId: thread.id } });
  return { thread, run };
}

async function cleanup(threadId: string, runId: string) {
  await prisma.run.delete({ where: { id: runId } }).catch(() => undefined);
  await prisma.thread.delete({ where: { id: threadId } }).catch(() => undefined);
}

describe.sequential('RunEventsService publishEvent broadcasting', () => {
  let publisher: CapturingPublisher;
  let runEvents: RunEventsService;

  beforeEach(() => {
    publisher = new CapturingPublisher();
    runEvents = new RunEventsService(prismaService, logger, publisher);
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

      const appendEvent = await runEvents.publishEvent(started.id, 'append');
      expect(appendEvent?.status).toBe('running');
      expect(publisher.events).toHaveLength(1);
      const appendRecord = publisher.events[0];
      expect(appendRecord.payload.mutation).toBe('append');
      expect(appendRecord.runId).toBe(run.id);
      expect(appendRecord.threadId).toBe(thread.id);
      const appendedEvent = appendRecord.payload.event as RunTimelineEvent;
      expect(appendedEvent.id).toBe(started.id);
      expect(appendedEvent.status).toBe('running');
      expect(appendedEvent.toolExecution?.toolName).toBe('search');
      expect(appendedEvent.toolExecution?.input).toEqual({ query: 'status' });
      expect(appendedEvent.toolExecution?.output).toBeNull();

      publisher.clear();

      await runEvents.completeToolExecution({
        eventId: started.id,
        status: ToolExecStatus.success,
        output: { answer: 42 },
        raw: { latencyMs: 1200 },
      });

      const updateEvent = await runEvents.publishEvent(started.id, 'update');
      expect(updateEvent?.status).toBe('success');
      expect(updateEvent?.toolExecution?.output).toEqual({ answer: 42 });
      expect(publisher.events).toHaveLength(1);
      const updateRecord = publisher.events[0];
      expect(updateRecord.payload.mutation).toBe('update');
      const updatedEvent = updateRecord.payload.event as RunTimelineEvent;
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
