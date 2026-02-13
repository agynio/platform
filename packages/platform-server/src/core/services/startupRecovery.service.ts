import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma, PrismaClient, RunEventStatus, RunStatus } from '@prisma/client';
import { RunEventStatus as RunEventStatusEnum, RunStatus as RunStatusEnum } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EventsBusService } from '../../events/events-bus.service';

type TransactionClient = Prisma.TransactionClient;

type RecoveredRun = {
  id: string;
  threadId: string;
  status: RunStatus;
  createdAt: Date;
  updatedAt: Date;
  ownerUserId: string;
};

type RecoveredReminder = {
  id: string;
  threadId: string;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

type RecoveredRunEvent = {
  id: string;
  runId: string;
  threadId: string;
  status: RunEventStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMs: number | null;
};

const RECOVERY_REASON = 'server_restart_recovery';
const LOCK_KEY_NAMESPACE = 0x53545254; // 'STRT'
const LOCK_KEY_ID = 0x0000_0001;

@Injectable()
export class StartupRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupRecoveryService.name);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const prisma = this.prismaService.getClient() as PrismaClient;
    const startedAt = Date.now();
    const recovery = {
      runs: [] as RecoveredRun[],
      runEvents: [] as RecoveredRunEvent[],
      reminders: [] as RecoveredReminder[],
      skipped: false,
    };

    try {
      await prisma.$transaction(async (tx: TransactionClient) => {
        const lockAcquired = await this.tryAcquireLock(tx);
        if (!lockAcquired) {
          recovery.skipped = true;
          return;
        }

        recovery.runs = await this.terminateRunningRuns(tx);
        recovery.runEvents = await this.cancelRunningRunEvents(tx);
        recovery.reminders = await this.completePendingReminders(tx);
      });
    } catch (err) {
      this.logger.error('Startup recovery failed', { reason: RECOVERY_REASON, error: err });
      throw err;
    }

    if (recovery.skipped) {
      this.logger.log('Startup recovery skipped (lock not acquired)', { reason: RECOVERY_REASON });
      return;
    }

    const durationMs = Date.now() - startedAt;
    const terminatedRuns = recovery.runs.length;
    const cancelledRunEvents = recovery.runEvents.length;
    const completedReminders = recovery.reminders.length;

    this.logger.log('Startup recovery completed', {
      reason: RECOVERY_REASON,
      terminatedRuns,
      cancelledRunEvents,
      completedReminders,
      durationMs,
    });

    this.emitEvents(recovery.runs, recovery.reminders, recovery.runEvents);
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
      select: { id: true, threadId: true, status: true, createdAt: true, updatedAt: true, thread: { select: { ownerUserId: true } } },
    });
    return updated.map((run) => ({
      id: run.id,
      threadId: run.threadId,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ownerUserId: run.thread?.ownerUserId ?? '',
    }));
  }

  private async completePendingReminders(tx: TransactionClient): Promise<RecoveredReminder[]> {
    type ReminderDelegate = Pick<NonNullable<TransactionClient['reminder']>, 'findMany' | 'updateMany'>;
    const reminderDelegate = (tx as unknown as { reminder?: ReminderDelegate }).reminder;
    if (!reminderDelegate || typeof reminderDelegate.findMany !== 'function' || typeof reminderDelegate.updateMany !== 'function') {
      this.logger.debug('Startup recovery skipping reminder updates (delegate unavailable)', { reason: RECOVERY_REASON });
      return [];
    }

    const pending = await reminderDelegate.findMany({
      where: { completedAt: null, cancelledAt: null },
      select: { id: true, threadId: true },
    });
    if (pending.length === 0) return [];

    const ids = pending.map((r) => r.id);
    const completedAt = new Date();
    await reminderDelegate.updateMany({ where: { id: { in: ids } }, data: { completedAt } });

    const completed = await reminderDelegate.findMany({
      where: { id: { in: ids } },
      select: { id: true, threadId: true, completedAt: true, cancelledAt: true },
    });
    return completed.map((rem) => ({ ...rem }));
  }

  private async cancelRunningRunEvents(tx: TransactionClient): Promise<RecoveredRunEvent[]> {
    type RunEventDelegate = Pick<NonNullable<TransactionClient['runEvent']>, 'findMany' | 'updateMany'>;
    const runEventDelegate = (tx as unknown as { runEvent?: RunEventDelegate }).runEvent;
    if (!runEventDelegate || typeof runEventDelegate.findMany !== 'function' || typeof runEventDelegate.updateMany !== 'function') {
      this.logger.debug('Startup recovery skipping run event updates (delegate unavailable)', { reason: RECOVERY_REASON });
      return [];
    }

    const running = await runEventDelegate.findMany({
      where: { status: RunEventStatusEnum.running },
      select: { id: true, runId: true, threadId: true, startedAt: true },
    });
    if (running.length === 0) return [];

    const endedAt = new Date();
    const updatedIds: string[] = [];
    for (const event of running) {
      const durationMs = event.startedAt ? Math.max(0, endedAt.getTime() - event.startedAt.getTime()) : null;
      const result = await runEventDelegate.updateMany({
        where: { id: event.id, status: RunEventStatusEnum.running },
        data: {
          status: RunEventStatusEnum.cancelled,
          endedAt,
          durationMs,
          errorCode: 'app_restart',
          errorMessage: 'terminated during startup reconciliation',
        },
      });
      if (result.count > 0) {
        updatedIds.push(event.id);
      }
    }

    if (updatedIds.length === 0) return [];

    const updated = await runEventDelegate.findMany({
      where: { id: { in: updatedIds } },
      select: { id: true, runId: true, threadId: true, status: true, startedAt: true, endedAt: true, durationMs: true },
    });

    return updated.map((event) => ({ ...event }));
  }

  private emitEvents(runs: RecoveredRun[], reminders: RecoveredReminder[], runEvents: RecoveredRunEvent[]): void {
    const runStatus = RunStatusEnum.terminated;
    const metricThreads = new Set<string>();

    for (const run of runs) {
      metricThreads.add(run.threadId);
      if (!run.ownerUserId) {
        this.logger.warn('Skipping run_status_changed emission due to missing owner', { runId: run.id, threadId: run.threadId });
        continue;
      }
      try {
        this.eventsBus.emitRunStatusChanged({
          threadId: run.threadId,
          ownerUserId: run.ownerUserId,
          run: {
            id: run.id,
            status: runStatus,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
          },
        });
      } catch (err) {
        this.logger.warn('Failed to emit run status change event during startup recovery', { runId: run.id, error: err });
      }
    }

    for (const reminder of reminders) {
      metricThreads.add(reminder.threadId);
    }

    for (const event of runEvents) {
      metricThreads.add(event.threadId);
    }

    for (const threadId of metricThreads) {
      try {
        this.eventsBus.emitThreadMetrics({ threadId });
      } catch (err) {
        this.logger.warn('Failed to schedule thread metrics during startup recovery', { threadId, error: err });
      }
    }
  }
}
