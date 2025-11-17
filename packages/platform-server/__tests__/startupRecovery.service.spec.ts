import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient, RunStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { LoggerService } from '../src/core/services/logger.service';
import { GraphEventsPublisher, NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
if (!databaseUrl) throw new Error('AGENTS_DATABASE_URL must be set for startupRecovery.service.spec.ts');

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

describe.sequential('StartupRecoveryService', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const prismaService = { getClient: () => prisma } as const;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('terminates running runs, completes reminders, and is idempotent', async () => {
    const thread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });
    const secondThread = await prisma.thread.create({ data: { alias: `startup-recovery-${randomUUID()}` } });

    const runningRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.running } });
    const finishedRun = await prisma.run.create({ data: { threadId: thread.id, status: RunStatus.finished } });
    const additionalRunning = await prisma.run.create({ data: { threadId: secondThread.id, status: RunStatus.running } });

    const pendingReminder = await prisma.reminder.create({ data: { threadId: thread.id, note: 'pending', at: new Date(Date.now() + 60_000), completedAt: null } });
    const completedReminder = await prisma.reminder.create({ data: { threadId: thread.id, note: 'done', at: new Date(Date.now() + 120_000), completedAt: new Date() } });

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
      run = {
        findMany: () => {
          throw new Error('run.findMany should not be invoked when lock is skipped');
        },
        updateMany: () => {
          throw new Error('run.updateMany should not be invoked when lock is skipped');
        },
      };
      reminder = {
        findMany: () => {
          throw new Error('reminder.findMany should not be invoked when lock is skipped');
        },
        updateMany: () => {
          throw new Error('reminder.updateMany should not be invoked when lock is skipped');
        },
      };
      $queryRaw = async () => [{ acquired: false }];
    }

    const stubPrisma = {
      async $transaction<T>(fn: (tx: LockSkippingTx) => Promise<T>): Promise<T> {
        return fn(new LockSkippingTx());
      },
    };

    const logger = new TestLogger();
    const events = new CaptureEventsPublisher();
    const service = new StartupRecoveryService({ getClient: () => stubPrisma } as any, logger, events);

    await service.onApplicationBootstrap();

    const skippedCall = logger.infoCalls.find((call) => call.message === 'Startup recovery skipped (lock not acquired)');
    expect(skippedCall).toBeDefined();
    expect(events.runStatusChanges).toHaveLength(0);
    expect(events.metricsScheduled).toHaveLength(0);
  });

  it('updates runs only when still marked running', async () => {
    const runId = randomUUID();

    class GuardedTx {
      run = {
        findMany: vi
          .fn()
          .mockImplementationOnce(async () => [{ id: runId, threadId: 'thread-1', createdAt: new Date() }])
          .mockImplementationOnce(async (args: unknown) => {
            expect(args).toMatchObject({ where: { id: { in: [runId] }, status: RunStatus.running } });
            return [
              {
                id: runId,
                threadId: 'thread-1',
                status: RunStatus.terminated,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];
          }),
        updateMany: vi.fn().mockImplementation(async (args: unknown) => {
          expect(args).toMatchObject({
            where: { id: { in: [runId] }, status: RunStatus.running },
            data: { status: RunStatus.terminated },
          });
          return { count: 1 };
        }),
      };

      reminder = {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      };

      $queryRaw = vi.fn().mockResolvedValue([{ acquired: true }]);
    }

    const tx = new GuardedTx();

    const stubPrisma = {
      async $transaction<T>(fn: (guarded: GuardedTx) => Promise<T>): Promise<T> {
        return fn(tx);
      },
    };

    const logger = new TestLogger();
    const events = new CaptureEventsPublisher();
    const service = new StartupRecoveryService({ getClient: () => stubPrisma } as any, logger, events);

    await service.onApplicationBootstrap();

    expect(tx.run.updateMany).toHaveBeenCalledTimes(1);
    const summary = logger.infoCalls.find((call) => call.message === 'Startup recovery completed');
    expect(summary).toBeDefined();
    expect(events.runStatusChanges).toHaveLength(1);
  });

  it('binds tx.$queryRaw during bootstrap', async () => {
    type BindingTx = {
      run: {
        findMany: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
      };
      reminder: {
        findMany: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
      };
      $queryRaw: (...args: unknown[]) => Promise<{ acquired: boolean }[]>;
    };

    const txInstance: BindingTx = {
      run: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      reminder: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: async () => [{ acquired: true }],
    };

    const queryRawSpy = vi.fn().mockImplementation(function (this: BindingTx) {
      expect(this).toBe(txInstance);
      return Promise.resolve([{ acquired: true }]);
    });

    txInstance.$queryRaw = queryRawSpy;

    const stubPrisma = {
      async $transaction<T>(fn: (tx: BindingTx) => Promise<T>): Promise<T> {
        return fn(txInstance);
      },
    };

    const logger = new TestLogger();
    const events = new CaptureEventsPublisher();
    const service = new StartupRecoveryService({ getClient: () => stubPrisma } as any, logger, events);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(queryRawSpy).toHaveBeenCalledTimes(1);
    const summary = logger.infoCalls.find((call) => call.message === 'Startup recovery completed');
    expect(summary).toBeDefined();
    expect(events.runStatusChanges).toHaveLength(0);
    expect(events.metricsScheduled).toHaveLength(0);
  });
});
