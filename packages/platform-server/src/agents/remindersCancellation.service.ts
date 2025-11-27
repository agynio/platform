import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { LoggerService } from '../core/services/logger.service';
import { EventsBusService } from '../events/events-bus.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { RemindMeNode } from '../nodes/tools/remind_me/remind_me.node';
import type { RemindMeFunctionTool } from '../nodes/tools/remind_me/remind_me.tool';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class RemindersCancellationService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {}

  async cancelThread(threadId: string, prismaOverride?: PrismaExecutor): Promise<{ cancelledDb: number; cancelledRuntime: number }> {
    const prisma = prismaOverride ?? this.prismaService.getClient();
    const cancelledAt = new Date();
    let runtimeCancelled = 0;

    let liveNodes: Array<{ id: string; template: string; instance: unknown }> = [];
    try {
      liveNodes = this.runtime.getNodes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersCancellationService nodes traversal failed', { threadId, error: message });
    }

    for (const liveNode of liveNodes) {
      if (liveNode.template !== 'remindMeTool') continue;
      const instance = liveNode.instance;
      if (!(instance instanceof RemindMeNode)) continue;
      const tool = instance.getTool() as RemindMeFunctionTool;
      if (typeof tool.cancelByThread !== 'function') continue;

      try {
        runtimeCancelled += await tool.cancelByThread(threadId, prisma, cancelledAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('RemindersCancellationService node cancellation error', {
          threadId,
          nodeId: liveNode.id,
          error: message,
        });
      }
    }

    let dbCancelled = 0;
    try {
      const result = await prisma.reminder.updateMany({
        where: { threadId, completedAt: null, cancelledAt: null },
        data: { cancelledAt },
      });
      dbCancelled = result.count ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersCancellationService persistence update error', { threadId, error: message });
    }

    try {
      this.eventsBus.emitThreadMetrics({ threadId });
      this.eventsBus.emitThreadMetricsAncestors({ threadId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RemindersCancellationService metrics emission failed', { threadId, error: message });
    }

    return { cancelledDb: dbCancelled, cancelledRuntime: runtimeCancelled };
  }
}
