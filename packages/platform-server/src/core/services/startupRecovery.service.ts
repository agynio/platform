import { Inject, Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';
import type { Prisma, PrismaClient, RunStatus } from '@prisma/client';
import { RunStatus as RunStatusEnum } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { LoggerService } from './logger.service';
import { GraphEventsPublisher } from '../../gateway/graph.events.publisher';

type TransactionClient = Prisma.TransactionClient;

type RecoveredRun = {
  id: string;
  threadId: string;
  status: RunStatus;
  createdAt: Date;
  updatedAt: Date;
};

type RecoveredReminder = {
  id: string;
  threadId: string;
  completedAt: Date | null;
};

const RECOVERY_REASON = 'server_restart_recovery';
const LOCK_KEY_NAMESPACE = 0x53545254; // 'STRT'
const LOCK_KEY_ID = 0x0000_0001;

@Injectable()
export class StartupRecoveryService implements OnApplicationBootstrap {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Optional() @Inject(GraphEventsPublisher) private readonly events?: GraphEventsPublisher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const prisma = this.prismaService.getClient() as PrismaClient;
    const startedAt = Date.now();
    const recovery = { runs: [] as RecoveredRun[], reminders: [] as RecoveredReminder[], skipped: false };

    try {
      await prisma.$transaction(async (tx: TransactionClient) => {
        const lockAcquired = await this.tryAcquireLock(tx);
        if (!lockAcquired) {
          recovery.skipped = true;
          return;
        }

        recovery.runs = await this.terminateRunningRuns(tx);
        recovery.reminders = await this.completePendingReminders(tx);
      });
    } catch (err) {
      this.logger.error('Startup recovery failed', { reason: RECOVERY_REASON, error: err });
      throw err;
    }

    if (recovery.skipped) {
      this.logger.info('Startup recovery skipped (lock not acquired)', { reason: RECOVERY_REASON });
      return;
    }

    const durationMs = Date.now() - startedAt;
    const terminatedRuns = recovery.runs.length;
    const completedReminders = recovery.reminders.length;

    this.logger.info('Startup recovery completed', {
      reason: RECOVERY_REASON,
      terminatedRuns,
      completedReminders,
      durationMs,
    });

    this.emitEvents(recovery.runs, recovery.reminders);
  }

  private async tryAcquireLock(tx: TransactionClient): Promise<boolean> {
    const queryRaw = (tx as unknown as { $queryRaw?: TransactionClient['$queryRaw'] }).$queryRaw;
    if (typeof queryRaw !== 'function') return true;
    try {
      // Call through tx.$queryRaw so Prisma retains the "this" binding on the proxy object.
      const rows = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY_NAMESPACE}::int, ${LOCK_KEY_ID}::int) AS acquired
      `;
      return rows?.[0]?.acquired ?? false;
    } catch (err) {
      this.logger.warn('Startup recovery advisory lock failed; continuing without lock', { error: err });
      return true;
    }
  }

  private async terminateRunningRuns(tx: TransactionClient): Promise<RecoveredRun[]> {
    type RunDelegate = Pick<NonNullable<TransactionClient['run']>, 'findMany' | 'updateMany'>;
    const runDelegate = (tx as unknown as { run?: RunDelegate }).run;
    if (!runDelegate || typeof runDelegate.findMany !== 'function' || typeof runDelegate.updateMany !== 'function') {
      this.logger.debug('Startup recovery skipping run updates (delegate unavailable)', { reason: RECOVERY_REASON });
      return [];
    }

    const running = await runDelegate.findMany({
      where: { status: RunStatusEnum.running },
      select: { id: true, threadId: true, createdAt: true },
    });
    if (running.length === 0) return [];

    const ids = running.map((r) => r.id);
    await runDelegate.updateMany({
      where: {
        id: { in: ids },
        status: RunStatusEnum.running,
      },
      data: { status: RunStatusEnum.terminated },
    });

    const updated = await runDelegate.findMany({
      where: { id: { in: ids }, status: RunStatusEnum.terminated },
      select: { id: true, threadId: true, status: true, createdAt: true, updatedAt: true },
    });
    return updated.map((run) => ({ ...run }));
  }

  private async completePendingReminders(tx: TransactionClient): Promise<RecoveredReminder[]> {
    type ReminderDelegate = Pick<NonNullable<TransactionClient['reminder']>, 'findMany' | 'updateMany'>;
    const reminderDelegate = (tx as unknown as { reminder?: ReminderDelegate }).reminder;
    if (!reminderDelegate || typeof reminderDelegate.findMany !== 'function' || typeof reminderDelegate.updateMany !== 'function') {
      this.logger.debug('Startup recovery skipping reminder updates (delegate unavailable)', { reason: RECOVERY_REASON });
      return [];
    }

    const pending = await reminderDelegate.findMany({
      where: { completedAt: null },
      select: { id: true, threadId: true },
    });
    if (pending.length === 0) return [];

    const ids = pending.map((r) => r.id);
    const completedAt = new Date();
    await reminderDelegate.updateMany({ where: { id: { in: ids } }, data: { completedAt } });

    const completed = await reminderDelegate.findMany({
      where: { id: { in: ids } },
      select: { id: true, threadId: true, completedAt: true },
    });
    return completed.map((rem) => ({ ...rem }));
  }

  private emitEvents(runs: RecoveredRun[], reminders: RecoveredReminder[]): void {
    if (!this.events) return;

    const runStatus = RunStatusEnum.terminated;
    const metricThreads = new Set<string>();

    for (const run of runs) {
      metricThreads.add(run.threadId);
      try {
        this.events.emitRunStatusChanged(run.threadId, {
          id: run.id,
          status: runStatus,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        });
      } catch (err) {
        this.logger.warn('Failed to emit run status change event during startup recovery', { runId: run.id, error: err });
      }
    }

    for (const reminder of reminders) {
      metricThreads.add(reminder.threadId);
    }

    for (const threadId of metricThreads) {
      try {
        this.events.scheduleThreadMetrics(threadId);
      } catch (err) {
        this.logger.warn('Failed to schedule thread metrics during startup recovery', { threadId, error: err });
      }
    }
  }
}
