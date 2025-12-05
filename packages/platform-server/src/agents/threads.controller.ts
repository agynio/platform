import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, IsISO8601, Max, Min, ValidateIf } from 'class-validator';
import { AgentsPersistenceService } from './agents.persistence.service';
import { Transform, Expose } from 'class-transformer';
import type { RunEventStatus, RunEventType, RunMessageType, ThreadStatus } from '@prisma/client';
import { ThreadCleanupCoordinator } from './threadCleanup.coordinator';
import type { ThreadMetrics } from './threads.metrics.service';
import { RunEventsService } from '../events/run-events.service';
import { RunSignalsRegistry } from './run-signals.service';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { HumanMessage } from '@agyn/llm';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import { isAgentLiveNode, isAgentRuntimeInstance } from './agent-node.utils';
import { randomUUID } from 'node:crypto';
import { ThreadParentNotFoundError } from './agents.persistence.service';

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

const THREAD_MESSAGE_MAX_LENGTH = 8000;

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

export class RunEventOutputQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(0)
  sinceSeq?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
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

export class ListThreadsTreeQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(0)
  @Max(2)
  depth?: number;

  @IsOptional()
  @IsBooleanString()
  includeMetrics?: string;

  @IsOptional()
  @IsBooleanString()
  includeAgentTitles?: string;

  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  childrenStatus?: 'open' | 'closed' | 'all';

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(1000)
  perParentChildrenLimit?: number;
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

type CreateThreadBody = {
  text?: unknown;
  agentNodeId?: unknown;
  parentId?: unknown;
  alias?: unknown;
};

@Controller('api/agents')
export class AgentsThreadsController {
  private static readonly MAX_MESSAGE_LENGTH = THREAD_MESSAGE_MAX_LENGTH;
  private readonly logger = new Logger(AgentsThreadsController.name);
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(ThreadCleanupCoordinator) private readonly cleanupCoordinator: ThreadCleanupCoordinator,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(RunSignalsRegistry) private readonly runSignals: RunSignalsRegistry,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
  ) {}

  @Post('threads')
  @HttpCode(201)
  async createThread(@Body() body: CreateThreadBody | null | undefined): Promise<{ id: string }> {
    const textValue = typeof body?.text === 'string' ? body.text : '';
    const text = textValue.trim();
    if (text.length === 0 || text.length > AgentsThreadsController.MAX_MESSAGE_LENGTH) {
      throw new BadRequestException({ error: 'bad_message_payload' });
    }

    const agentNodeValue = typeof body?.agentNodeId === 'string' ? body.agentNodeId : '';
    const agentNodeId = agentNodeValue.trim();
    if (agentNodeId.length === 0) {
      throw new BadRequestException({ error: 'bad_message_payload' });
    }

    const aliasCandidate = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const alias = aliasCandidate.length > 0 ? aliasCandidate : `ui:${randomUUID()}`;
    const parentIdCandidate = typeof body?.parentId === 'string' ? body.parentId.trim() : '';
    const parentId = parentIdCandidate.length > 0 ? parentIdCandidate : null;

    const liveNodes = this.runtime.getNodes();
    const agentNodes = liveNodes.filter((node) => isAgentLiveNode(node, this.templateRegistry));
    if (agentNodes.length === 0) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }
    const liveAgentNode = agentNodes.find((node) => node.id === agentNodeId);
    if (!liveAgentNode) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }

    const instance = liveAgentNode.instance;
    if (!isAgentRuntimeInstance(instance)) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }

    if (instance.status !== 'ready') {
      throw new ServiceUnavailableException({ error: 'agent_unready' });
    }

    let threadId: string;
    try {
      const created = await this.persistence.createThreadWithInitialMessage({
        alias,
        text,
        agentNodeId,
        parentId,
      });
      threadId = created.id;
    } catch (error) {
      if (error instanceof ThreadParentNotFoundError || (error instanceof Error && error.message === 'parent_not_found')) {
        throw new NotFoundException({ error: 'parent_not_found' });
      }
      if (error instanceof Error && (error.message === 'thread_alias_required' || error.message === 'agent_node_id_required')) {
        throw new BadRequestException({ error: 'bad_message_payload' });
      }
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`createThread persistence failed alias=${alias}`, stack, AgentsThreadsController.name);
      throw new InternalServerErrorException({ error: 'create_failed' });
    }

    try {
      const invocation = instance.invoke(threadId, [HumanMessage.fromText(text)]);
      void invocation.catch((error) => {
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`createThread invoke failed thread=${threadId} agent=${agentNodeId}`, stack, AgentsThreadsController.name);
      });
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`createThread immediate failure thread=${threadId} agent=${agentNodeId}`, stack, AgentsThreadsController.name);
      throw new InternalServerErrorException({ error: 'create_failed' });
    }

    return { id: threadId } as const;
  }

  @Get('threads')
  async listThreads(@Query() query: ListThreadsQueryDto) {
    const rootsOnly = (query.rootsOnly ?? 'false') === 'true';
    const status = query.status ?? 'all';
    const limit = Number(query.limit) ?? 100;
    const threads = await this.persistence.listThreads({ rootsOnly, status, limit });
    const includeMetrics = (query.includeMetrics ?? 'false') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'false') === 'true';
    const ids = threads.map((t) => t.id);
    const [metrics, descriptors] = await Promise.all([
      includeMetrics && ids.length > 0
        ? this.persistence.getThreadsMetrics(ids)
        : Promise.resolve<Record<string, ThreadMetrics>>({}),
      ids.length > 0
        ? this.persistence.getThreadsAgentDescriptors(ids)
        : Promise.resolve<Record<string, { title: string; role?: string; name?: string }>>({}),
    ]);
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    const items = threads.map((t) => {
      const descriptor = descriptors[t.id];
      return {
        ...t,
        agentRole: descriptor?.role ?? undefined,
        agentName: descriptor?.name ?? undefined,
        ...(includeMetrics ? { metrics: { ...defaultMetrics, ...(metrics[t.id] ?? {}) } } : {}),
        ...(includeAgentTitles ? { agentTitle: descriptor?.title ?? fallbackTitle } : {}),
      };
    });
    return { items };
  }

  @Get('threads/tree')
  async listThreadsTree(@Query() query: ListThreadsTreeQueryDto) {
    const status = query.status ?? 'all';
    const limit = query.limit ?? 50;
    const depth = (query.depth ?? 2) as 0 | 1 | 2;
    const includeMetrics = (query.includeMetrics ?? 'true') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'true') === 'true';
    const childrenStatus = query.childrenStatus ?? status;
    const perParentChildrenLimit = query.perParentChildrenLimit ?? 1000;
    const items = await this.persistence.listThreadsTree({
      status,
      limit,
      depth,
      includeMetrics,
      includeAgentTitles,
      childrenStatus,
      perParentChildrenLimit,
    });
    return { items };
  }

  @Get('threads/:threadId/children')
  async listChildren(@Param('threadId') threadId: string, @Query() query: ListChildrenQueryDto) {
    const items = await this.persistence.listChildren(threadId, query.status ?? 'all');
    const includeMetrics = (query.includeMetrics ?? 'false') === 'true';
    const includeAgentTitles = (query.includeAgentTitles ?? 'false') === 'true';
    const ids = items.map((t) => t.id);
    const [metrics, descriptors] = await Promise.all([
      includeMetrics && ids.length > 0
        ? this.persistence.getThreadsMetrics(ids)
        : Promise.resolve<Record<string, ThreadMetrics>>({}),
      ids.length > 0
        ? this.persistence.getThreadsAgentDescriptors(ids)
        : Promise.resolve<Record<string, { title: string; role?: string; name?: string }>>({}),
    ]);
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';
    return {
      items: items.map((t) => {
        const descriptor = descriptors[t.id];
        return {
          ...t,
          agentRole: descriptor?.role ?? undefined,
          agentName: descriptor?.name ?? undefined,
          ...(includeMetrics ? { metrics: { ...defaultMetrics, ...(metrics[t.id] ?? {}) } } : {}),
          ...(includeAgentTitles ? { agentTitle: descriptor?.title ?? fallbackTitle } : {}),
        };
      }),
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
      agentRole: thread.agentRole ?? undefined,
      agentName: thread.agentName ?? undefined,
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

  @Get('runs/:runId/events/:eventId/output')
  async getRunEventOutput(
    @Param('runId') runId: string,
    @Param('eventId') eventId: string,
    @Query() query: RunEventOutputQueryDto,
  ) {
    try {
      const snapshot = await this.runEvents.getToolOutputSnapshot({
        runId,
        eventId,
        sinceSeq: query.sinceSeq,
        limit: query.limit,
        order: query.order,
      });
      if (!snapshot) throw new NotFoundException('event_not_found');
      return snapshot;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotImplementedException(
        'Tool output persistence unavailable. Run `pnpm --filter @agyn/platform-server prisma migrate deploy` followed by `pnpm --filter @agyn/platform-server prisma generate` to install the latest schema.',
      );
    }
  }

  @Patch('threads/:threadId')
  async patchThread(@Param('threadId') threadId: string, @Body() body: PatchThreadBodyDto) {
    const update: { summary?: string | null; status?: ThreadStatus } = {};
    if (body.summary !== undefined) update.summary = body.summary;
    if (body.status !== undefined) update.status = body.status;
    const result = await this.persistence.updateThread(threadId, update);

    if (result.status === 'closed' && result.previousStatus !== 'closed') {
      void this.cleanupCoordinator.closeThreadWithCascade(threadId);
    }
    return { ok: true };
  }

  @Post('threads/:threadId/messages')
  @HttpCode(202)
  async sendThreadMessage(@Param('threadId') threadId: string, @Body() body: unknown): Promise<{ ok: true }> {
    const text = this.extractMessageText(body);
    if (!text) {
      throw new BadRequestException({ error: 'bad_message_payload' });
    }

    const thread = await this.persistence.getThreadById(threadId);
    if (!thread) {
      throw new NotFoundException({ error: 'thread_not_found' });
    }
    if (thread.status === 'closed') {
      throw new ConflictException({ error: 'thread_closed' });
    }

    const liveNodes = this.runtime.getNodes();
    const agentNodes = liveNodes.filter((node) => isAgentLiveNode(node, this.templateRegistry));
    if (agentNodes.length === 0) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }

    let agentNodeId = thread.assignedAgentNodeId ?? null;
    if (!agentNodeId) {
      const candidateNodeIds = agentNodes.map((node) => node.id);
      const fallbackAgentNodeId = await this.persistence.getLatestAgentNodeIdForThread(threadId, { candidateNodeIds });
      if (!fallbackAgentNodeId) {
        throw new ServiceUnavailableException({ error: 'agent_unavailable' });
      }
      agentNodeId = fallbackAgentNodeId;
      await this.persistence.ensureAssignedAgent(threadId, agentNodeId);
    }

    const liveAgentNode = agentNodes.find((node) => node.id === agentNodeId);
    if (!liveAgentNode) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }

    const instance = liveAgentNode.instance;
    if (!isAgentRuntimeInstance(instance)) {
      throw new ServiceUnavailableException({ error: 'agent_unavailable' });
    }
    if (instance.status !== 'ready') {
      throw new ServiceUnavailableException({ error: 'agent_unready' });
    }

    try {
      const invocation = instance.invoke(threadId, [HumanMessage.fromText(text)]);
      void invocation.catch((error) => {
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `sendThreadMessage invoke failed thread=${threadId} agent=${agentNodeId}`,
          stack,
          AgentsThreadsController.name,
        );
      });
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `sendThreadMessage immediate failure thread=${threadId} agent=${agentNodeId}`,
        stack,
        AgentsThreadsController.name,
      );
      throw new InternalServerErrorException({ error: 'send_failed' });
    }

    return { ok: true } as const;
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

  private extractMessageText(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const textValue = (body as Record<string, unknown>).text;
    if (typeof textValue !== 'string') return null;
    const trimmed = textValue.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > AgentsThreadsController.MAX_MESSAGE_LENGTH) return null;
    return trimmed;
  }
}
