import { Controller, Get, Inject, Query } from '@nestjs/common';
import { IsIn, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentsPersistenceService } from './agents.persistence.service';

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(['active', 'completed', 'all'])
  filter?: 'active' | 'completed' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;
}

@Controller('api/agents')
export class AgentsRemindersController {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  @Get('reminders')
  async listReminders(
    @Query() query: ListRemindersQueryDto,
  ): Promise<{ items: Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null }> }> {
    const filter = query.filter ?? 'active';
    const take = query.take ?? 100;
    const items = await this.persistence.listReminders(filter, take);
    return { items };
  }
}
