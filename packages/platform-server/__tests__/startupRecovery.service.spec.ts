import { afterAll, describe, expect, it, vi, type SpyInstance } from 'vitest';
import { PrismaClient, RunEventStatus, RunEventType, RunStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import type { EventsBusService } from '../src/events/events-bus.service';
import { Logger } from '@nestjs/common';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

type LoggerSpies = {
  logSpy: SpyInstance;
  warnSpy: SpyInstance;
  errorSpy: SpyInstance;
  debugSpy: SpyInstance;
  restore: () => void;
};

class CaptureEventsBus {
  readonly runStatusChanges: Array<{ threadId: string; runId: string; status: RunStatus }> = [];
  readonly metricsScheduled: string[] = [];

  emitRunStatusChanged(payload: { threadId: string; run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date } }): void {
    this.runStatusChanges.push({ threadId: payload.threadId, runId: payload.run.id, status: payload.run.status });
  }

  emitThreadMetrics(payload: { threadId: string }): void {
    this.metricsScheduled.push(payload.threadId);
  }
}

const initLoggerSpies = (): LoggerSpies => {
  const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

  return {
    logSpy,
    warnSpy,
    errorSpy,
    debugSpy,
    restore() {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
    },
  };
};

if (!shouldRunDbTests) {
  describe.skip('StartupRecoveryService', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const prismaService = { getClient: () => prisma } as const;

  describe.sequential('StartupRecoveryService', () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('terminates running runs, cancels run events, completes reminders, and is idempotent', async () => {
      const thread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });
      const secondThread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });
      const eventOnlyThread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });

      const runningRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.running } });
      const finishedRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.finished } });
      const additionalRunning = await prisma.run.create({ data: { threadId: secondThread.id, status: RunStatus.running } });
      const eventOnlyRun = await prisma.run.create({ data: { threadId: eventOnlyThread.id, status: RunStatus.finished } });

      const pendingReminder = await prisma.reminder.create({
        data: { threadId: thread.id, note: 'pending', at: new Date(Date.now() + 60_000), completedAt: null },
      });
      const completedReminder = await prisma.reminder.create({
        data: { threadId: thread.id, note: 'done', at: new Date(Date.now() + 120_000), completedAt: new Date() },
      });

      const runningEvent = await prisma.runEvent.create({
        data: {
          runId: runningRun.id,
          threadId: thread.id,
          type: RunEventType.tool_execution,
          status: RunEventStatus.running,
          startedAt: new Date(Date.now() - 5_000),
        },
      });
      const secondRunningEvent = await prisma.runEvent.create({
        data: {
          runId: additionalRunning.id,
          threadId: secondThread.id,
          type: RunEventType.llm_call,
          status: RunEventStatus.running,
          startedAt: new Date(Date.now() - 10_000),
        },
      });
      const finishedEvent = await prisma.runEvent.create({
        data: {
          runId: finishedRun.id,
          threadId: thread.id,
          type: RunEventType.llm_call,
          status: RunEventStatus.success,
          startedAt: new Date(Date.now() - 20_000),
          endedAt: new Date(Date.now() - 10_000),
          durationMs: 10_000,
        },
      });
      const eventOnlyRunningEvent = await prisma.runEvent.create({
        data: {
          runId: eventOnlyRun.id,
          threadId: eventOnlyThread.id,
          type: RunEventType.invocation_message,
          status: RunEventStatus.running,
        },
      });

      const spies = initLoggerSpies();
      const events = new CaptureEventsBus();
      const service = new StartupRecoveryService(prismaService as any, events as unknown as EventsBusService);

      try {
        await service.onApplicationBootstrap();

        const recoveredRun = await prisma.run.findUniqueOrThrow({ where: { id: runningRun.id } });
        expect(recoveredRun.status).toBe(RunStatus.terminated);

        const finishedRunUnchanged = await prisma.run.findUniqueOrThrow({ where: { id: finishedRun.id } });
        expect(finishedRunUnchanged.status).toBe(RunStatus.finished);

        const additionalRecovered = await prisma.run.findUniqueOrThrow({ where: { id: additionalRunning.id } });
        expect(additionalRecovered.status).toBe(RunStatus.terminated);

        const recoveredEvent = await prisma.runEvent.findUniqueOrThrow({ where: { id: runningEvent.id } });
        expect(recoveredEvent.status).toBe(RunEventStatus.cancelled);
        expect(recoveredEvent.endedAt).toBeInstanceOf(Date);
        expect(recoveredEvent.durationMs).toBeGreaterThanOrEqual(0);
        if (recoveredEvent.startedAt) {
          expect(recoveredEvent.durationMs).toBe(recoveredEvent.endedAt!.getTime() - recoveredEvent.startedAt.getTime());
        }
        expect(recoveredEvent.errorCode).toBe('app_restart');
        expect(recoveredEvent.errorMessage).toBe('terminated during startup reconciliation');

        const recoveredSecondEvent = await prisma.runEvent.findUniqueOrThrow({ where: { id: secondRunningEvent.id } });
        expect(recoveredSecondEvent.status).toBe(RunEventStatus.cancelled);
        expect(recoveredSecondEvent.endedAt).toBeInstanceOf(Date);
        expect(recoveredSecondEvent.durationMs).toBeGreaterThanOrEqual(0);
        const recoveredEventOnly = await prisma.runEvent.findUniqueOrThrow({ where: { id: eventOnlyRunningEvent.id } });
        expect(recoveredEventOnly.status).toBe(RunEventStatus.cancelled);
        expect(recoveredEventOnly.endedAt).toBeInstanceOf(Date);
        expect(recoveredEventOnly.durationMs).toBeNull();

        const finishedEventUnchanged = await prisma.runEvent.findUniqueOrThrow({ where: { id: finishedEvent.id } });
        expect(finishedEventUnchanged.status).toBe(RunEventStatus.success);
        expect(finishedEventUnchanged.endedAt).not.toBeNull();
        const firstEndedAt = recoveredEvent.endedAt;
        const firstDuration = recoveredEvent.durationMs;

        const secondEndedAt = recoveredSecondEvent.endedAt;
        const secondDuration = recoveredSecondEvent.durationMs;
        const eventOnlyEndedAt = recoveredEventOnly.endedAt;

        const pendingReminderUpdated = await prisma.reminder.findUniqueOrThrow({ where: { id: pendingReminder.id } });
        expect(pendingReminderUpdated.completedAt).toBeInstanceOf(Date);

        const completedReminderUnchanged = await prisma.reminder.findUniqueOrThrow({ where: { id: completedReminder.id } });
        expect(completedReminderUnchanged.completedAt).not.toBeNull();

        const summaryCall = spies.logSpy.mock.calls.find(([message]) => message === 'Startup recovery completed');
        expect(summaryCall).toBeDefined();
        const summaryPayload = (summaryCall?.[1] ?? {}) as Record<string, unknown>;
        expect(summaryPayload?.terminatedRuns).toBe(2);
        expect(summaryPayload?.cancelledRunEvents).toBe(3);
        expect(summaryPayload?.completedReminders).toBe(1);

        expect(events.runStatusChanges).toEqual(
          expect.arrayContaining([
            { threadId: thread.id, runId: runningRun.id, status: RunStatus.terminated },
            { threadId: secondThread.id, runId: additionalRunning.id, status: RunStatus.terminated },
          ]),
        );
        expect(new Set(events.metricsScheduled)).toEqual(new Set([thread.id, secondThread.id, eventOnlyThread.id]));

        const secondSpies = initLoggerSpies();
        const eventsSecond = new CaptureEventsBus();
        const serviceSecond = new StartupRecoveryService(prismaService as any, eventsSecond as unknown as EventsBusService);

        try {
          await serviceSecond.onApplicationBootstrap();

          const secondSummary = secondSpies.logSpy.mock.calls.find(([message]) => message === 'Startup recovery completed');
          const secondPayload = (secondSummary?.[1] ?? {}) as Record<string, unknown>;
          expect(secondPayload?.terminatedRuns).toBe(0);
          expect(secondPayload?.cancelledRunEvents).toBe(0);
          expect(secondPayload?.completedReminders).toBe(0);
          expect(eventsSecond.runStatusChanges).toHaveLength(0);
          expect(eventsSecond.metricsScheduled).toHaveLength(0);

          const recoveredEventAfterSecond = await prisma.runEvent.findUniqueOrThrow({ where: { id: runningEvent.id } });
          expect(recoveredEventAfterSecond.endedAt?.getTime()).toBe(firstEndedAt?.getTime());
          expect(recoveredEventAfterSecond.durationMs).toBe(firstDuration);

          const recoveredSecondEventAfterSecond = await prisma.runEvent.findUniqueOrThrow({ where: { id: secondRunningEvent.id } });
          expect(recoveredSecondEventAfterSecond.endedAt?.getTime()).toBe(secondEndedAt?.getTime());
          expect(recoveredSecondEventAfterSecond.durationMs).toBe(secondDuration);

          const recoveredEventOnlyAfterSecond = await prisma.runEvent.findUniqueOrThrow({ where: { id: eventOnlyRunningEvent.id } });
          expect(recoveredEventOnlyAfterSecond.endedAt?.getTime()).toBe(eventOnlyEndedAt?.getTime());
          expect(recoveredEventOnlyAfterSecond.durationMs).toBeNull();
        } finally {
          secondSpies.restore();
        }
      } finally {
        spies.restore();
        await prisma.reminder.deleteMany({ where: { id: { in: [pendingReminder.id, completedReminder.id] } } });
        await prisma.run.deleteMany({ where: { threadId: { in: [thread.id, secondThread.id, eventOnlyThread.id] } } });
        await prisma.thread.deleteMany({ where: { id: { in: [thread.id, secondThread.id, eventOnlyThread.id] } } });
      }
    });

    it('skips recovery when advisory lock is not acquired', async () => {
      class LockSkippingTx {
        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ acquired: boolean }>> {
          expect(strings[0]).toContain('pg_try_advisory_xact_lock');
          expect(values).toHaveLength(2);
          return [{ acquired: false }];
        }
      }

      const prismaSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn) => {
        return (fn as (tx: LockSkippingTx) => Promise<unknown>)(new LockSkippingTx());
      });

      const spies = initLoggerSpies();
      const events = new CaptureEventsBus();
      const service = new StartupRecoveryService(prismaService as any, events as unknown as EventsBusService);

      try {
        await service.onApplicationBootstrap();

        expect(prismaSpy).toHaveBeenCalledTimes(1);
        const skipLogged = spies.logSpy.mock.calls.some(([message]) =>
          typeof message === 'string' && message.includes('Startup recovery skipped'),
        );
        expect(skipLogged).toBe(true);
        expect(events.runStatusChanges).toHaveLength(0);
        expect(events.metricsScheduled).toHaveLength(0);
      } finally {
        spies.restore();
        prismaSpy.mockRestore();
      }
    });

    it('logs errors encountered during recovery and propagates failure', async () => {
      class ThrowingTx {
        readonly run = {
          findMany: vi.fn(async () => [{ id: 'run-id', threadId: 'thread-id', createdAt: new Date(), status: RunStatus.running }]),
          updateMany: vi.fn(async () => {
            throw new Error('simulated failure');
          }),
        };

        readonly reminder = {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        };

        readonly runEvent = {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        };

        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ acquired: boolean }>> {
          expect(strings[0]).toContain('pg_try_advisory_xact_lock');
          expect(values).toHaveLength(2);
          return [{ acquired: true }];
        }
      }

      const prismaSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn) => {
        return (fn as (tx: ThrowingTx) => Promise<unknown>)(new ThrowingTx());
      });

      const spies = initLoggerSpies();
      const events = new CaptureEventsBus();
      const service = new StartupRecoveryService(prismaService as any, events as unknown as EventsBusService);

      try {
        await expect(service.onApplicationBootstrap()).rejects.toThrow('simulated failure');

        expect(prismaSpy).toHaveBeenCalledTimes(1);
        const errorLogged = spies.errorSpy.mock.calls.some(([message, payload]) => {
          if (message !== 'Startup recovery failed') return false;
          const details = (payload ?? {}) as { error?: unknown };
          const err = details?.error as Error | undefined;
          return err instanceof Error && err.message === 'simulated failure';
        });
        expect(errorLogged).toBe(true);
        expect(events.runStatusChanges).toHaveLength(0);
        expect(events.metricsScheduled).toHaveLength(0);
      } finally {
        spies.restore();
        prismaSpy.mockRestore();
      }
    });
  });
}
