import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import { Transform } from 'class-transformer';
import type { RunMessageType, ThreadStatus } from '@prisma/client';
import { ContainerThreadTerminationService } from '../infra/container/containerThreadTermination.service';
import type { ThreadMetrics } from './threads.metrics.service';

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

  @IsOptional()
  @IsBooleanString()
  includeMetrics?: string; // parse to boolean

  @IsOptional()
  @IsBooleanString()
  includeAgentTitles?: string; // parse to boolean
}

export class ListChildrenQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';

  @IsOptional()
  @IsBooleanString()
  includeMetrics?: string; // parse to boolean

  @IsOptional()
  @IsBooleanString()
  includeAgentTitles?: string; // parse to boolean
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
    @Inject(ContainerThreadTerminationService) private readonly terminationService: ContainerThreadTerminationService,
  ) {}

  @Get('threads')
  async listThreads(@Query() query: ListThreadsQueryDto) {
    const rootsOnly = (query.rootsOnly ?? 'false') === 'true';
    const status = query.status ?? 'all';
    const limit = Number(query.limit) ?? 100;
    const threads = await this.persistence.listThreads({ rootsOnly, status, limit });
    const includeMetrics = (query.includeMetrics ?? 'false') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'false') === 'true';
    if (!includeMetrics && !includeAgentTitles) return { items: threads };
    const ids = threads.map((t) => t.id);
    const [metrics, agentTitles] = await Promise.all([
      includeMetrics && ids.length > 0
        ? this.persistence.getThreadsMetrics(ids)
        : Promise.resolve<Record<string, ThreadMetrics>>({}),
      includeAgentTitles && ids.length > 0
        ? this.persistence.getThreadsAgentTitles(ids)
        : Promise.resolve<Record<string, string>>({}),
    ]);
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    const items = threads.map((t) => ({
      ...t,
      ...(includeMetrics ? { metrics: { ...defaultMetrics, ...(metrics[t.id] ?? {}) } } : {}),
      ...(includeAgentTitles ? { agentTitle: agentTitles[t.id] ?? fallbackTitle } : {}),
    }));
    return { items };
  }

  @Get('threads/:threadId/children')
  async listChildren(@Param('threadId') threadId: string, @Query() query: ListChildrenQueryDto) {
    const items = await this.persistence.listChildren(threadId, query.status ?? 'all');
    const includeMetrics = (query.includeMetrics ?? 'false') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'false') === 'true';
    if (!includeMetrics && !includeAgentTitles) return { items };
    const ids = items.map((t) => t.id);
    const [metrics, agentTitles] = await Promise.all([
      includeMetrics && ids.length > 0
        ? this.persistence.getThreadsMetrics(ids)
        : Promise.resolve<Record<string, ThreadMetrics>>({}),
      includeAgentTitles && ids.length > 0
        ? this.persistence.getThreadsAgentTitles(ids)
        : Promise.resolve<Record<string, string>>({}),
    ]);
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    return {
      items: items.map((t) => ({
        ...t,
        ...(includeMetrics ? { metrics: { ...defaultMetrics, ...(metrics[t.id] ?? {}) } } : {}),
        ...(includeAgentTitles ? { agentTitle: agentTitles[t.id] ?? fallbackTitle } : {}),
      })),
    };
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
    const result = await this.persistence.updateThread(threadId, update);

    if (result.status === 'closed' && result.previousStatus !== 'closed') {
      void this.terminationService.terminateByThread(threadId, { synchronous: false });
    }
    return { ok: true };
  }

  @Get('threads/:threadId/metrics')
  async getThreadMetrics(@Param('threadId') threadId: string) {
    const metrics = await this.persistence.getThreadsMetrics([threadId]);
    return metrics[threadId] ?? { remindersCount: 0, activity: 'idle' as const, runsCount: 0 };
  }
}
