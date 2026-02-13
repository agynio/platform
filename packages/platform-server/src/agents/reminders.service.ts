import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { RemindMeNode } from '../nodes/tools/remind_me/remind_me.node';
import type { RemindMeFunctionTool } from '../nodes/tools/remind_me/remind_me.tool';
import { EventsBusService } from '../events/events-bus.service';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

interface CancelThreadRemindersOptions {
  threadId: string;
  prismaOverride?: PrismaExecutor;
  emitMetrics?: boolean;
}

interface CancelReminderOptions {
  reminderId: string;
  prismaOverride?: PrismaExecutor;
  emitMetrics?: boolean;
  ownerUserId?: string;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  async cancelThreadReminders({ threadId, prismaOverride, emitMetrics }: CancelThreadRemindersOptions): Promise<{
    cancelledDb: number;
    clearedRuntime: number;
  }> {
    const prisma = prismaOverride ?? this.prismaService.getClient();
    const cancelledAt = new Date();

    let cancelledDb = 0;
    try {
      const result = await prisma.reminder.updateMany({
        where: { threadId, completedAt: null, cancelledAt: null },
        data: { cancelledAt },
      });
      cancelledDb = result.count ?? 0;
    } catch (error) {
      this.logger.warn(
        `RemindersService persistence update error${this.format({ threadId, error: this.errorInfo(error) })}`,
      );
    }

    let clearedRuntime = 0;
    for (const liveNode of this.safeGetRuntimeNodes(threadId)) {
      if (liveNode.template !== 'remindMeTool') continue;
      const instance = liveNode.instance;
      if (!(instance instanceof RemindMeNode)) continue;
      const tool = instance.getTool() as RemindMeFunctionTool;
      if (typeof tool.clearTimersByThread !== 'function') continue;

      try {
        const clearedIds = tool.clearTimersByThread(threadId);
        clearedRuntime += clearedIds.length;
      } catch (error) {
        this.logger.warn(
          `RemindersService runtime cancellation error${this.format({
            threadId,
            nodeId: liveNode.id,
            error: this.errorInfo(error),
          })}`,
        );
      }
    }

    if (emitMetrics && (cancelledDb > 0 || clearedRuntime > 0)) {
      this.emitMetrics(threadId);
    }

    return { cancelledDb, clearedRuntime };
  }

  async cancelReminder({ reminderId, prismaOverride, emitMetrics, ownerUserId }: CancelReminderOptions): Promise<
    | {
        threadId: string;
        cancelledDb: boolean;
        clearedRuntime: number;
      }
    | null
  > {
    const prisma = prismaOverride ?? this.prismaService.getClient();

    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
      select: { id: true, threadId: true, completedAt: true, cancelledAt: true, thread: { select: { ownerUserId: true } } },
    });
    if (!reminder) {
      return null;
    }

    if (ownerUserId && reminder.thread?.ownerUserId !== ownerUserId) {
      return null;
    }

    const threadId = reminder.threadId ?? null;

    let cancelledDb = false;
    if (!reminder.completedAt && !reminder.cancelledAt) {
      try {
        await prisma.reminder.update({ where: { id: reminderId }, data: { cancelledAt: new Date() } });
        cancelledDb = true;
      } catch (error) {
        this.logger.warn(
          `RemindersService persistence single-cancel error${this.format({
            reminderId,
            threadId,
            error: this.errorInfo(error),
          })}`,
        );
      }
    }

    const runtimeResult = this.clearRuntimeReminder(reminderId, threadId ?? undefined);
    const resolvedThreadId = runtimeResult.threadId ?? threadId;
    const clearedRuntime = runtimeResult.cleared ? 1 : 0;

    if (emitMetrics && resolvedThreadId) {
      this.emitMetrics(resolvedThreadId);
    }

    return {
      threadId: resolvedThreadId ?? reminder.threadId ?? '',
      cancelledDb,
      clearedRuntime,
    };
  }

  private clearRuntimeReminder(reminderId: string, threadIdHint?: string): { cleared: boolean; threadId?: string } {
    let resolvedThreadId = threadIdHint;
    for (const liveNode of this.safeGetRuntimeNodes(threadIdHint ?? reminderId)) {
      if (liveNode.template !== 'remindMeTool') continue;
      const instance = liveNode.instance;
      if (!(instance instanceof RemindMeNode)) continue;
      const tool = instance.getTool() as RemindMeFunctionTool;
      if (typeof tool.clearTimerById !== 'function') continue;

      try {
        const clearedThreadId = tool.clearTimerById(reminderId);
        if (typeof clearedThreadId === 'string') {
          resolvedThreadId = clearedThreadId;
          return { cleared: true, threadId: resolvedThreadId };
        }
      } catch (error) {
        this.logger.warn(
          `RemindersService runtime single-cancel error${this.format({
            reminderId,
            threadId: threadIdHint,
            nodeId: liveNode.id,
            error: this.errorInfo(error),
          })}`,
        );
      }
    }
    return { cleared: false, threadId: resolvedThreadId };
  }

  private emitMetrics(threadId: string): void {
    try {
      this.eventsBus.emitThreadMetrics({ threadId });
      this.eventsBus.emitThreadMetricsAncestors({ threadId });
    } catch (error) {
      this.logger.warn(
        `RemindersService metrics emit failed${this.format({ threadId, error: this.errorInfo(error) })}`,
      );
    }
  }

  private safeGetRuntimeNodes(threadId?: string) {
    try {
      return this.runtime.getNodes();
    } catch (error) {
      this.logger.warn(
        `RemindersService runtime traversal failed${this.format({ threadId, error: this.errorInfo(error) })}`,
      );
      return [] as Array<{ id: string; template: string; instance: unknown }>;
    }
  }
}
