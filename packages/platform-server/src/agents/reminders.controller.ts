import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min, Max, IsOptional, IsUUID } from 'class-validator';
import {
  AgentsPersistenceService,
  type ListRemindersPage,
  type RemindersListFilter,
  type RemindersSortField,
  type RemindersSortOrder,
} from './agents.persistence.service';

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(['active', 'completed', 'all'])
  filter?: 'active' | 'completed' | 'all';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  perPage?: number;

  @IsOptional()
  @IsIn(['createdAt', 'at', 'completedAt'])
  sortBy?: 'createdAt' | 'at' | 'completedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsUUID()
  threadId?: string;
}

@Controller('api/agents')
export class AgentsRemindersController {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  @Get('reminders')
  async listReminders(@Query() query: ListRemindersQueryDto): Promise<ListRemindersPage> {
    const filter: RemindersListFilter = query.filter ?? 'active';
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const sortBy: RemindersSortField = query.sortBy ?? 'createdAt';
    const sortOrder: RemindersSortOrder = query.sortOrder ?? 'desc';

    return this.persistence.listRemindersPaged(filter, page, perPage, sortBy, sortOrder, query.threadId);
  }
}
