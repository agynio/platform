import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, IsISO8601, Max, Min, ValidateIf } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import { Transform, Expose } from 'class-transformer';
import type { RunEventStatus, RunEventType, RunMessageType, ThreadStatus } from '@prisma/client';
import { ContainerThreadTerminationService } from '../infra/container/containerThreadTermination.service';
import type { ThreadMetrics } from './threads.metrics.service';
import { RunEventsService } from '../events/run-events.service';
import { RunSignalsRegistry } from './run-signals.service';

// Avoid runtime import of Prisma in tests; enumerate allowed values
export const RunMessageTypeValues: ReadonlyArray<RunMessageType> = ['input', 'injected', 'output'];

export const RunEventTypeValues: ReadonlyArray<RunEventType> = [
  'invocation_message',
  'injection',
  'llm_call',
  'tool_execution',
  'summarization',
];

export const RunEventStatusValues: ReadonlyArray<RunEventStatus> = ['pending', 'running', 'success', 'error', 'cancelled'];

const isRunEventType = (value: string): value is RunEventType => (RunEventTypeValues as ReadonlyArray<string>).includes(value);
const isRunEventStatus = (value: string): value is RunEventStatus => (RunEventStatusValues as ReadonlyArray<string>).includes(value);

export class ListRunMessagesQueryDto {
  @IsIn(RunMessageTypeValues)
  type!: RunMessageType;
}

export class RunTimelineEventsQueryDto {
  @IsOptional()
  @IsString()
  types?: string;

  @IsOptional()
  @IsString()
  statuses?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @Expose({ name: 'cursor[ts]' })
  @IsISO8601()
  cursorTs?: string;

  @IsOptional()
  @Expose({ name: 'cursor[id]' })
  @IsString()
  cursorId?: string;
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

export class GetThreadQueryDto {
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
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(RunSignalsRegistry) private readonly runSignals: RunSignalsRegistry,
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
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
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
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    return {
      items: items.map((t) => ({
        ...t,
        ...(includeMetrics ? { metrics: { ...defaultMetrics, ...(metrics[t.id] ?? {}) } } : {}),
        ...(includeAgentTitles ? { agentTitle: agentTitles[t.id] ?? fallbackTitle } : {}),
      })),
    };
  }

  @Get('threads/:threadId')
  async getThread(@Param('threadId') threadId: string, @Query() query: GetThreadQueryDto) {
    const includeMetrics = (query.includeMetrics ?? 'false') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'false') === 'true';
    const thread = await this.persistence.getThreadById(threadId, { includeMetrics, includeAgentTitles });
    if (!thread) throw new NotFoundException('thread_not_found');
    if (!includeMetrics && !includeAgentTitles) return thread;
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    return {
      ...thread,
      ...(includeMetrics ? { metrics: thread.metrics ?? defaultMetrics } : {}),
      ...(includeAgentTitles ? { agentTitle: thread.agentTitle ?? fallbackTitle } : {}),
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

  @Get('runs/:runId/summary')
  async getRunTimelineSummary(@Param('runId') runId: string) {
    const summary = await this.runEvents.getRunSummary(runId);
    if (!summary) throw new NotFoundException('run_not_found');
    return summary;
  }

  @Get('runs/:runId/events')
  async listRunTimelineEvents(
    @Param('runId') runId: string,
    @Query() query: RunTimelineEventsQueryDto,
    @Query('type') typeFilter?: string | string[],
    @Query('status') statusFilter?: string | string[],
  ) {
    const collect = (input?: string | string[]) => {
      if (!input) return [] as string[];
      const values = Array.isArray(input) ? input : [input];
      const tokens: string[] = [];
      for (const value of values) {
        for (const token of value.split(',')) {
          const trimmed = token.trim();
          if (trimmed.length > 0) tokens.push(trimmed);
        }
      }
      return tokens;
    };

    const typeValues = Array.from(
      new Set([
        ...collect(query.types),
        ...collect(typeFilter),
      ]),
    ).filter((v): v is RunEventType => isRunEventType(v));

    const statusValues = Array.from(
      new Set([
        ...collect(query.statuses),
        ...collect(statusFilter),
      ]),
    ).filter((v): v is RunEventStatus => isRunEventStatus(v));

    let cursor: { ts: Date; id?: string } | undefined;
    if (query.cursorTs) {
      const ts = new Date(query.cursorTs);
      if (!Number.isNaN(ts.getTime())) {
        cursor = { ts, id: query.cursorId ?? undefined };
      }
    }

    return this.runEvents.listRunEvents({
      runId,
      types: typeValues.length > 0 ? typeValues : undefined,
      statuses: statusValues.length > 0 ? statusValues : undefined,
      limit: query.limit,
      order: query.order,
      cursor,
    });
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
    return metrics[threadId] ?? { remindersCount: 0, containersCount: 0, activity: 'idle' as const, runsCount: 0 };
  }

  @Post('runs/:runId/terminate')
  async terminateRun(@Param('runId') runId: string) {
    const run = await this.persistence.getRunById(runId);
    if (!run) throw new NotFoundException('run_not_found');
    if (run.status !== 'running') {
      return { ok: true };
    }
    this.runSignals.activateTerminate(runId);
    return { ok: true };
  }
}
