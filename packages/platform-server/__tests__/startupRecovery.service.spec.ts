import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient, RunStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { LoggerService } from '../src/core/services/logger.service';
import { GraphEventsPublisher, NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

class TestLogger extends LoggerService {
  readonly infoCalls: Array<{ message: string; params: unknown[] }> = [];
  readonly warnCalls: Array<{ message: string; params: unknown[] }> = [];
  readonly errorCalls: Array<{ message: string; params: unknown[] }> = [];
  readonly debugCalls: Array<{ message: string; params: unknown[] }> = [];

  override info(message: string, ...optionalParams: unknown[]): void {
    this.infoCalls.push({ message, params: optionalParams });
  }

  override debug(message: string, ...optionalParams: unknown[]): void {
    this.debugCalls.push({ message, params: optionalParams });
  }

  override warn(message: string, ...optionalParams: unknown[]): void {
    this.warnCalls.push({ message, params: optionalParams });
  }

  override error(message: string, ...optionalParams: unknown[]): void {
    this.errorCalls.push({ message, params: optionalParams });
  }
}

class CaptureEventsPublisher extends NoopGraphEventsPublisher {
  readonly runStatusChanges: Array<{ threadId: string; runId: string; status: RunStatus }> = [];
  readonly metricsScheduled: string[] = [];

  override emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void {
    this.runStatusChanges.push({ threadId, runId: run.id, status: run.status });
  }

  override scheduleThreadMetrics(threadId: string): void {
    this.metricsScheduled.push(threadId);
  }
}

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

    it('terminates running runs, completes reminders, and is idempotent', async () => {
      const thread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });
      const secondThread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });

      const runningRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.running } });
      const finishedRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.finished } });
      const additionalRunning = await prisma.run.create({ data: { threadId: secondThread.id, status: RunStatus.running } });

      const pendingReminder = await prisma.reminder.create({
        data: { threadId: thread.id, note: 'pending', at: new Date(Date.now() + 60_000), completedAt: null },
      });
      const completedReminder = await prisma.reminder.create({
        data: { threadId: thread.id, note: 'done', at: new Date(Date.now() + 120_000), completedAt: new Date() },
      });

      const logger = new TestLogger();
      const events = new CaptureEventsPublisher();
      const service = new StartupRecoveryService(prismaService as any, logger, events);

      await service.onApplicationBootstrap();

      const recoveredRun = await prisma.run.findUniqueOrThrow({ where: { id: runningRun.id } });
      expect(recoveredRun.status).toBe(RunStatus.terminated);

      const finishedRunUnchanged = await prisma.run.findUniqueOrThrow({ where: { id: finishedRun.id } });
      expect(finishedRunUnchanged.status).toBe(RunStatus.finished);

      const additionalRecovered = await prisma.run.findUniqueOrThrow({ where: { id: additionalRunning.id } });
      expect(additionalRecovered.status).toBe(RunStatus.terminated);

      const pendingReminderUpdated = await prisma.reminder.findUniqueOrThrow({ where: { id: pendingReminder.id } });
      expect(pendingReminderUpdated.completedAt).toBeInstanceOf(Date);

      const completedReminderUnchanged = await prisma.reminder.findUniqueOrThrow({ where: { id: completedReminder.id } });
      expect(completedReminderUnchanged.completedAt).not.toBeNull();

      const summaryCall = logger.infoCalls.find((call) => call.message === 'Startup recovery completed');
      expect(summaryCall).toBeDefined();
      const summaryPayload = (summaryCall?.params[0] ?? {}) as Record<string, unknown>;
      expect(summaryPayload?.terminatedRuns).toBe(2);
      expect(summaryPayload?.completedReminders).toBe(1);

      expect(events.runStatusChanges).toEqual(
        expect.arrayContaining([
          { threadId: thread.id, runId: runningRun.id, status: RunStatus.terminated },
          { threadId: secondThread.id, runId: additionalRunning.id, status: RunStatus.terminated },
        ]),
      );
      expect(new Set(events.metricsScheduled)).toEqual(new Set([thread.id, secondThread.id]));

      const loggerSecond = new TestLogger();
      const eventsSecond = new CaptureEventsPublisher();
      const serviceSecond = new StartupRecoveryService(prismaService as any, loggerSecond, eventsSecond);

      await serviceSecond.onApplicationBootstrap();

      const secondSummary = loggerSecond.infoCalls.find((call) => call.message === 'Startup recovery completed');
      const secondPayload = (secondSummary?.params[0] ?? {}) as Record<string, unknown>;
      expect(secondPayload?.terminatedRuns).toBe(0);
      expect(secondPayload?.completedReminders).toBe(0);
      expect(eventsSecond.runStatusChanges).toHaveLength(0);
      expect(eventsSecond.metricsScheduled).toHaveLength(0);

      await prisma.reminder.deleteMany({ where: { id: { in: [pendingReminder.id, completedReminder.id] } } });
      await prisma.run.deleteMany({ where: { threadId: { in: [thread.id, secondThread.id] } } });
      await prisma.thread.deleteMany({ where: { id: { in: [thread.id, secondThread.id] } } });
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

      const logger = new TestLogger();
      const events = new CaptureEventsPublisher();
      const service = new StartupRecoveryService(prismaService as any, logger, events);

      await service.onApplicationBootstrap();

      expect(prismaSpy).toHaveBeenCalledTimes(1);
      expect(logger.infoCalls.some((call) => call.message.includes('Startup recovery skipped'))).toBe(true);
      expect(events.runStatusChanges).toHaveLength(0);
      expect(events.metricsScheduled).toHaveLength(0);

      prismaSpy.mockRestore();
    });

    it('logs errors encountered during recovery without throwing', async () => {
      class ThrowingTx {
        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ acquired: boolean }>> {
          expect(strings[0]).toContain('pg_try_advisory_xact_lock');
          expect(values).toHaveLength(2);
          return [{ acquired: true }];
        }

        async run(updateFn: unknown): Promise<never> {
          expect(typeof updateFn).toBe('function');
          throw new Error('simulated failure');
        }

        async reminder(): Promise<never> {
          throw new Error('should not be called');
        }
      }

      const prismaSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn) => {
        return (fn as (tx: ThrowingTx) => Promise<unknown>)(new ThrowingTx());
      });

      const logger = new TestLogger();
      const events = new CaptureEventsPublisher();
      const service = new StartupRecoveryService(prismaService as any, logger, events);

      await service.onApplicationBootstrap();

      expect(prismaSpy).toHaveBeenCalledTimes(1);
      expect(logger.errorCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Startup recovery failed: simulated failure' }),
        ]),
      );
      expect(events.runStatusChanges).toHaveLength(0);
      expect(events.metricsScheduled).toHaveLength(0);

      prismaSpy.mockRestore();
    });
  });
}
