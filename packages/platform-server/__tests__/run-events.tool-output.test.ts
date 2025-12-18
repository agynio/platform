import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

if (!shouldRunDbTests) {
  describe.skip('RunEventsService tool output streaming', () => {
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

  async function cleanup(threadId: string, runId: string) {
    await prisma.run.delete({ where: { id: runId } });
    await prisma.thread.delete({ where: { id: threadId } });
  }

  describe.sequential('RunEventsService tool output streaming', () => {
    beforeEach(async () => {
      await prisma.toolOutputChunk.deleteMany({});
      await prisma.toolOutputTerminal.deleteMany({});
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('persists chunks and snapshot pagination', async () => {
      const { thread, run } = await createThreadAndRun();
      const started = await runEvents.startToolExecution({
        runId: run.id,
        threadId: thread.id,
        toolName: 'shell_command',
        input: { command: 'echo hi' },
      });

      await runEvents.appendToolOutputChunk({
        runId: run.id,
        threadId: thread.id,
        eventId: started.id,
        seqGlobal: 1,
        seqStream: 1,
        source: 'stdout',
        data: 'hello',
        bytes: 5,
      });
      await runEvents.appendToolOutputChunk({
        runId: run.id,
        threadId: thread.id,
        eventId: started.id,
        seqGlobal: 2,
        seqStream: 1,
        source: 'stderr',
        data: 'warn',
        bytes: 4,
      });

      const snapshot = await runEvents.getToolOutputSnapshot({ runId: run.id, eventId: started.id, order: 'asc' });
      expect(snapshot).not.toBeNull();
      expect(snapshot?.items).toHaveLength(2);
      expect(snapshot?.items[0]).toMatchObject({ seqGlobal: 1, source: 'stdout', data: 'hello' });
      expect(snapshot?.items[1]).toMatchObject({ seqGlobal: 2, source: 'stderr', data: 'warn' });
      expect(snapshot?.terminal).toBeNull();

      const incremental = await runEvents.getToolOutputSnapshot({
        runId: run.id,
        eventId: started.id,
        order: 'asc',
        sinceSeq: 1,
      });
      expect(incremental).not.toBeNull();
      expect(incremental?.items).toHaveLength(1);
      expect(incremental?.items[0]).toMatchObject({ seqGlobal: 2, source: 'stderr', data: 'warn' });

      await cleanup(thread.id, run.id);
    });

    it('stores terminal summary with status metadata', async () => {
      const { thread, run } = await createThreadAndRun();
      const started = await runEvents.startToolExecution({
        runId: run.id,
        threadId: thread.id,
        toolName: 'shell_command',
        input: { command: 'long task' },
      });

      await runEvents.appendToolOutputChunk({
        runId: run.id,
        threadId: thread.id,
        eventId: started.id,
        seqGlobal: 1,
        seqStream: 1,
        source: 'stdout',
        data: 'partial',
        bytes: 7,
      });

      await runEvents.finalizeToolOutputTerminal({
        runId: run.id,
        threadId: thread.id,
        eventId: started.id,
        exitCode: 0,
        status: 'success',
        bytesStdout: 7,
        bytesStderr: 0,
        totalChunks: 1,
        droppedChunks: 0,
        savedPath: null,
        message: 'completed',
      });

      const snapshot = await runEvents.getToolOutputSnapshot({ runId: run.id, eventId: started.id });
      expect(snapshot).not.toBeNull();
      expect(snapshot?.terminal).toMatchObject({ status: 'success', exitCode: 0, message: 'completed' });
      expect(snapshot?.terminal?.bytesStdout).toBe(7);
      expect(snapshot?.terminal?.totalChunks).toBe(1);

      await cleanup(thread.id, run.id);
    });
  });
}
