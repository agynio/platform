import { Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min, Max, IsOptional, IsUUID } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import { RemindersService } from './reminders.service';

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(['active', 'completed', 'cancelled', 'all'])
  filter?: 'active' | 'completed' | 'cancelled' | 'all';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  take?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsIn(['latest', 'createdAt', 'at'])
  sort?: 'latest' | 'createdAt' | 'at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsUUID()
  threadId?: string;
}

@Controller('api/agents')
export class AgentsRemindersController {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
  ) {}

  @Get('reminders')
  async listReminders(@Query() query: ListRemindersQueryDto) {
    const wantsPagination =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      query.sort !== undefined ||
      query.order !== undefined;

    if (wantsPagination) {
      const result = await this.persistence.listRemindersPaginated({
        filter: query.filter ?? 'all',
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        sort: query.sort ?? 'latest',
        order: query.order ?? 'desc',
        threadId: query.threadId,
      });
      return result;
    }

    const filter = query.filter ?? 'active';
    const take = query.take ?? 100;
    const items = await this.persistence.listReminders(filter, take, query.threadId);
    return { items };
  }

  @Post('reminders/:reminderId/cancel')
  async cancelReminder(@Param('reminderId') reminderId: string) {
    const result = await this.reminders.cancelReminder({ reminderId, emitMetrics: true });
    if (!result) {
      throw new NotFoundException({ error: 'reminder_not_found' });
    }
    if (!result.threadId) {
      throw new NotFoundException({ error: 'reminder_not_found' });
    }
    return { ok: true as const, threadId: result.threadId };
  }
}
