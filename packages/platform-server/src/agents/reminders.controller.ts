import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min, Max, IsOptional, IsUUID } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(['active', 'completed', 'all'])
  filter?: 'active' | 'completed' | 'all';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  take?: number;

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
  async listReminders(@Query() query: ListRemindersQueryDto) {
    const filter = query.filter ?? 'active';
    const take = query.take ?? 100;
    const items = await this.persistence.listReminders(filter, take, query.threadId);
    return { items };
  }
}
