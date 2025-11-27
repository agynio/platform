import { Controller, Get, Param, Query, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { LiveGraphRuntime as RuntimeService } from '../../graph-core/liveGraph.manager';
import type { Reminder } from '@prisma/client';

interface RemindMeInspectable {
  getActiveReminders(): Reminder[];
}
function isRemindMeInspectable(x: unknown): x is RemindMeInspectable {
  return !!x && typeof (x as Record<string, unknown>)['getActiveReminders'] === 'function';
}

@Controller('api/graph/nodes')
export class RemindersController {
  private readonly logger = new Logger(RemindersController.name);

  constructor(
    @Inject(RuntimeService) private readonly runtimeService: RuntimeService,
  ) {}

  @Get(':nodeId/reminders')
  async getReminders(
    @Param('nodeId') nodeId: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: Reminder[] }> {
    try {
      const inst = this.runtimeService.getNodeInstance(nodeId);
      if (!inst) throw new HttpException({ error: 'node_not_found' }, HttpStatus.NOT_FOUND);
      if (!isRemindMeInspectable(inst)) throw new HttpException({ error: 'not_remindme_node' }, HttpStatus.NOT_FOUND);
      const items = (inst as RemindMeInspectable).getActiveReminders();
      const n = typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined;
      const bounded = typeof n === 'number' && Number.isFinite(n) ? Math.min(1000, Math.max(1, n)) : undefined;
      return { items: typeof bounded === 'number' ? items.slice(0, bounded) : items };
    } catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      const errorInfo =
        e instanceof Error
          ? {
              name: e.name,
              message: e.message,
              stack: e.stack,
            }
          : { error: e };
      this.logger.error(`reminders controller error ${JSON.stringify(errorInfo)}`);
      throw new HttpException({ error: 'server_error' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
