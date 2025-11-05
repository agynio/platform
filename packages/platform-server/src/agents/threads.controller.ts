import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import { Transform } from 'class-transformer';
import type { RunMessageType, ThreadStatus } from '@prisma/client';

// Avoid runtime import of Prisma in tests; enumerate allowed values
export const RunMessageTypeValues: ReadonlyArray<RunMessageType> = ['input', 'injected', 'output'];

export class ListRunMessagesQueryDto {
  @IsIn(RunMessageTypeValues)
  type!: RunMessageType;
}

export class ListThreadsQueryDto {
  @IsOptional()
  @IsBooleanString()
  rootsOnly?: string; // parse to boolean

  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ListChildrenQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';
}

export class PatchThreadBodyDto {
  @IsOptional()
  // Allow null explicitly; validate string only when not null or undefined
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: ThreadStatus;
}

@Controller('api/agents')
export class AgentsThreadsController {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  @Get('threads')
  async listThreads(@Query() query: ListThreadsQueryDto) {
    const rootsOnly = (query.rootsOnly ?? 'false') === 'true';
    const status = query.status ?? 'all';
    const limit = query.limit ?? 100;
    const threads = await this.persistence.listThreads({ rootsOnly, status, limit });
    return { items: threads };
  }

  @Get('threads/:threadId/children')
  async listChildren(@Param('threadId') threadId: string, @Query() query: ListChildrenQueryDto) {
    const items = await this.persistence.listChildren(threadId, query.status ?? 'all');
    return { items };
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

  @Patch('threads/:threadId')
  async patchThread(@Param('threadId') threadId: string, @Body() body: PatchThreadBodyDto) {
    const update: { summary?: string | null; status?: ThreadStatus } = {};
    if (body.summary !== undefined) update.summary = body.summary;
    if (body.status !== undefined) update.status = body.status;
    await this.persistence.updateThread(threadId, update);
    return { ok: true };
  }
}
