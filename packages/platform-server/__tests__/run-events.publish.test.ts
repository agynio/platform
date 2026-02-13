import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient, ToolExecStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { ConfigService } from '../src/core/services/config.service';
import type { AuthService } from '../src/auth/auth.service';
import { RunEventsService, type RunTimelineEvent } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

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
  let gateway: GraphSocketGateway;
  let emitRunEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    runEvents = new RunEventsService(prismaService);
    eventsBus = new EventsBusService(runEvents);
    const runtime = { subscribe: vi.fn() } as any;
    const metrics = { getThreadsMetrics: vi.fn().mockResolvedValue({}) } as any;
    const prismaStub = { getClient: vi.fn().mockReturnValue({ $queryRaw: vi.fn().mockResolvedValue([]) }) } as any;
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authServiceStub = { resolvePrincipalFromCookieHeader: vi.fn() } as unknown as AuthService;
    gateway = new GraphSocketGateway(runtime, metrics, prismaStub, eventsBus, configStub, authServiceStub);
    emitRunEventSpy = vi.spyOn(gateway, 'emitRunEvent');
    await gateway.onModuleInit();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    emitRunEventSpy.mockRestore();
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
      expect(emitRunEventSpy).toHaveBeenCalledTimes(1);
      const appendRecord = emitRunEventSpy.mock.calls[0];
      expect(appendRecord[0]).toBe(run.id);
      expect(appendRecord[1]).toBe(thread.id);
      expect(appendRecord[2].mutation).toBe('append');
      const appendedEvent = appendRecord[2].event as RunTimelineEvent;
      expect(appendedEvent.id).toBe(started.id);
      expect(appendedEvent.status).toBe('running');
      expect(appendedEvent.toolExecution?.toolName).toBe('search');
      expect(appendedEvent.toolExecution?.input).toEqual({ query: 'status' });
      expect(appendedEvent.toolExecution?.output).toBeNull();

      emitRunEventSpy.mockClear();

      await runEvents.completeToolExecution({
        eventId: started.id,
        status: ToolExecStatus.success,
        output: { answer: 42 },
        raw: { latencyMs: 1200 },
      });

      const updateEvent = await eventsBus.publishEvent(started.id, 'update');
      expect(updateEvent?.status).toBe('success');
      expect(updateEvent?.toolExecution?.output).toEqual({ answer: 42 });
      expect(emitRunEventSpy).toHaveBeenCalledTimes(1);
      const updateRecord = emitRunEventSpy.mock.calls[0];
      expect(updateRecord[0]).toBe(run.id);
      expect(updateRecord[1]).toBe(thread.id);
      expect(updateRecord[2].mutation).toBe('update');
      const updatedEvent = updateRecord[2].event as RunTimelineEvent;
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
