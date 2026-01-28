import { describe, it, expect, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import type { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { GraphRepository } from '../src/graph/graph.repository';
import { HumanMessage, SystemMessage, AIMessage } from '@agyn/llm';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { UserService } from '../src/auth/user.service';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

if (!shouldRunDbTests) {
  describe.skip('call_agent timeline metadata linkage', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const prismaService = { getClient: () => prisma } as unknown as PrismaService;

  const metricsStub = { getThreadsMetrics: async () => ({}) } as ThreadsMetricsService;
  const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as unknown as TemplateRegistry;
  const graphRepoStub = { get: async () => ({ nodes: [], edges: [] }) } as unknown as GraphRepository;

  const runEvents = new RunEventsService(prismaService);
  const eventsBus = new EventsBusService(runEvents);
  const callAgentLinking = new CallAgentLinkingService(prismaService, runEvents, eventsBus);
  const userService = new UserService(prismaService);
  const agents = new AgentsPersistenceService(
    prismaService,
    metricsStub,
    templateRegistryStub,
    graphRepoStub,
    runEvents,
    callAgentLinking,
    eventsBus,
    userService,
  );

  async function createCallAgentParentEvent(parentThreadId: string, childThreadId: string, runId: string) {
    const toolEvent = await prisma.runEvent.create({
      data: {
        runId,
        threadId: parentThreadId,
        type: 'tool_execution',
        status: 'running',
        startedAt: new Date(),
        metadata: {
          tool: 'call_agent',
          parentThreadId,
          childThreadId,
          childRun: {
            id: null,
            status: 'queued',
            linkEnabled: false,
            latestMessageId: null,
          },
          childRunId: null,
          childMessageId: null,
          childRunLinkEnabled: false,
          childRunStatus: 'queued',
        },
      },
    });

    await prisma.toolExecution.create({
      data: {
        eventId: toolEvent.id,
        llmCallEventId: null,
        toolName: 'call_agent',
        toolCallId: 'call-agent-1',
        input: {},
        output: Prisma.JsonNull,
        execStatus: 'success',
        errorMessage: null,
        raw: Prisma.JsonNull,
      },
    });

    return toolEvent.id;
  }

  async function loadMetadata(eventId: string) {
    const event = await prisma.runEvent.findUnique({ where: { id: eventId } });
    return event?.metadata as Record<string, unknown> | undefined;
  }

  async function collectMessageIds(runId: string): Promise<string[]> {
    const messages = await prisma.message.findMany({
      where: { runLinks: { some: { runId } } },
      select: { id: true },
    });
    return messages.map((m) => m.id);
  }

  describe.sequential('call_agent timeline metadata linkage', () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('links child run lifecycle to parent tool execution metadata', async () => {
      const parentThread = await prisma.thread.create({ data: { alias: `parent-${randomUUID()}` } });
      const childThread = await prisma.thread.create({ data: { alias: `child-${randomUUID()}`, parentId: parentThread.id } });
      const parentRun = await prisma.run.create({ data: { threadId: parentThread.id } });
      const toolEventId = await createCallAgentParentEvent(parentThread.id, childThread.id, parentRun.id);

      try {
        const { runId } = await agents.beginRunThread(childThread.id, [HumanMessage.fromText('hello from parent')]);
        const firstMetadata = await loadMetadata(toolEventId);
        expect(firstMetadata).toBeDefined();
        expect(firstMetadata?.tool).toBe('call_agent');
        expect(firstMetadata?.parentThreadId).toBe(parentThread.id);
        expect(firstMetadata?.childThreadId).toBe(childThread.id);
        expect(firstMetadata?.childRunId).toBe(runId);
        expect(firstMetadata?.childRunLinkEnabled).toBe(true);
        expect(firstMetadata?.childRunStatus).toBe('running');
        const childRunMeta = firstMetadata?.childRun as Record<string, unknown> | undefined;
        expect(childRunMeta).toBeDefined();
        expect(childRunMeta?.id).toBe(runId);
        expect(childRunMeta?.status).toBe('running');
        expect(childRunMeta?.linkEnabled).toBe(true);
        expect(typeof childRunMeta?.latestMessageId).toBe('string');
        expect(typeof firstMetadata?.childMessageId).toBe('string');

        const initialMessageIds = await collectMessageIds(runId);
        expect(initialMessageIds).toContain(firstMetadata?.childMessageId as string);

        await agents.recordInjected(runId, [SystemMessage.fromText('additional context')]);
        const afterInjection = await loadMetadata(toolEventId);
        expect(afterInjection?.childRunId).toBe(runId);
        expect(afterInjection?.childRunStatus).toBe('running');
        expect(afterInjection?.childRunLinkEnabled).toBe(true);
        const injectedChildRun = afterInjection?.childRun as Record<string, unknown> | undefined;
        expect(injectedChildRun?.id).toBe(runId);
        expect(injectedChildRun?.status).toBe('running');
        expect(injectedChildRun?.linkEnabled).toBe(true);
        expect(typeof injectedChildRun?.latestMessageId).toBe('string');
        expect(typeof afterInjection?.childMessageId).toBe('string');
        const injectedIds = await prisma.runMessage.findMany({
          where: { runId, type: 'injected' },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });
        if (injectedIds.length > 0) {
          expect(injectedIds[0]?.messageId).toBe(afterInjection?.childMessageId);
        }

        await agents.completeRun(runId, 'finished', [AIMessage.fromText('done')]);
        const afterCompletion = await loadMetadata(toolEventId);
        expect(afterCompletion?.childRunStatus).toBe('finished');
        expect(afterCompletion?.childRunId).toBe(runId);
        const completedChildRun = afterCompletion?.childRun as Record<string, unknown> | undefined;
        expect(completedChildRun?.status).toBe('finished');
        expect(completedChildRun?.id).toBe(runId);
      } finally {
        const childRuns = await prisma.run.findMany({ where: { threadId: childThread.id }, select: { id: true } });
        for (const child of childRuns) {
          const messageIds = await collectMessageIds(child.id);
          await prisma.runMessage.deleteMany({ where: { runId: child.id } });
          if (messageIds.length > 0) await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
          await prisma.runEvent.deleteMany({ where: { runId: child.id } });
          await prisma.run.delete({ where: { id: child.id } }).catch(() => undefined);
        }

        await prisma.toolExecution.deleteMany({ where: { eventId: toolEventId } });
        await prisma.runEvent.deleteMany({ where: { id: toolEventId } });
        await prisma.run.delete({ where: { id: parentRun.id } }).catch(() => undefined);
        await prisma.thread.delete({ where: { id: childThread.id } }).catch(() => undefined);
        await prisma.thread.delete({ where: { id: parentThread.id } }).catch(() => undefined);
      }
    });
  });
}
