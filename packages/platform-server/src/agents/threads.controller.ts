import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { IsEnum, IsString } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import type { RunMessageType } from '@prisma/client';

export class ListRunMessagesQueryDto {
  @IsEnum(['input', 'injected', 'output'])
  type!: RunMessageType;
}

@Controller('api/agents')
export class AgentsThreadsController {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  @Get('threads')
  async listThreads() {
    const threads = await this.persistence.listThreads();
    return { items: threads };
  }

  @Get('threads/:threadId/runs')
  async listRuns(@Param('threadId') threadId: string) {
    const runs = await this.persistence.listRuns(threadId);
    return { items: runs };
  }

  @Get('runs/:runId/messages')
  async listRunMessages(@Param('runId') runId: string, @Query() query: ListRunMessagesQueryDto) {
    const items = await this.persistence.listRunMessages(runId, query.type);
    return { items };
  }
}
