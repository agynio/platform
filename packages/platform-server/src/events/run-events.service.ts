import { Inject, Injectable } from '@nestjs/common';
import {
  AttachmentKind,
  ContextItemRole,
  EventSourceKind,
  Prisma,
  PrismaClient,
  RunEvent,
  RunEventStatus,
  RunEventType,
  RunStatus,
  ToolExecStatus,
} from '@prisma/client';
import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { GraphEventsPublisher } from '../gateway/graph.events.publisher';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import { ContextItemInput, NormalizedContextItem, normalizeContextItems, upsertNormalizedContextItems } from '../llm/services/context-items.utils';

type Tx = PrismaClient | Prisma.TransactionClient;

const MAX_INLINE_TEXT = 32_768;

const RUN_EVENT_INCLUDE = {
  eventMessage: {
    include: {
      message: {
        select: { id: true, kind: true, text: true, source: true, createdAt: true },
      },
    },
  },
  llmCall: {
    include: {
      toolCalls: {
        select: { callId: true, name: true, arguments: true, idx: true },
        orderBy: { idx: 'asc' as const },
      },
    },
  },
  toolExecution: true,
  summarization: true,
  injection: true,
  attachments: true,
} satisfies Prisma.RunEventInclude;

type RunEventWithRelations = Prisma.RunEventGetPayload<{ include: typeof RUN_EVENT_INCLUDE }>;

export type SerializedContextItem = {
  id: string;
  role: ContextItemRole;
  contentText: string | null;
  contentJson: unknown;
  metadata: unknown;
  sizeBytes: number;
  createdAt: string;
};

type ContextItemRow = Prisma.ContextItemGetPayload<{
  select: {
    id: true;
    role: true;
    contentText: true;
    contentJson: true;
    metadata: true;
    sizeBytes: true;
    createdAt: true;
  };
}>;

const RUN_EVENT_TYPES: ReadonlyArray<RunEventType> = [
  RunEventType.invocation_message,
  RunEventType.injection,
  RunEventType.llm_call,
  RunEventType.tool_execution,
  RunEventType.summarization,
] as const;

const RUN_EVENT_STATUSES: ReadonlyArray<RunEventStatus> = [
  RunEventStatus.pending,
  RunEventStatus.running,
  RunEventStatus.success,
  RunEventStatus.error,
  RunEventStatus.cancelled,
] as const;

export type RunTimelineEvent = {
  id: string;
  runId: string;
  threadId: string;
  type: RunEventType;
  status: RunEventStatus;
  ts: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  nodeId: string | null;
  sourceKind: EventSourceKind;
  sourceSpanId: string | null;
  metadata: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  llmCall?: {
    provider: string | null;
    model: string | null;
    temperature: number | null;
    topP: number | null;
    stopReason: string | null;
    contextItemIds: string[];
    responseText: string | null;
    rawResponse: unknown;
    toolCalls: Array<{ callId: string; name: string; arguments: unknown }>;
    usage?: {
      inputTokens: number | null;
      cachedInputTokens: number | null;
      outputTokens: number | null;
      reasoningTokens: number | null;
      totalTokens: number | null;
    };
  };
  toolExecution?: {
    toolName: string;
    toolCallId: string | null;
    execStatus: ToolExecStatus;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    raw: unknown;
  };
  summarization?: {
    summaryText: string;
    newContextCount: number;
    oldContextTokens: number | null;
    raw: unknown;
  };
  injection?: {
    messageIds: string[];
    reason: string | null;
  };
  message?: {
    messageId: string;
    role: string;
    kind: string | null;
    text: string | null;
    source: unknown;
    createdAt: string;
  };
  attachments: Array<{
    id: string;
    kind: AttachmentKind;
    isGzip: boolean;
    sizeBytes: number;
    contentJson: unknown;
    contentText: string | null;
  }>;
};

export type RunTimelineSummary = {
  runId: string;
  threadId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  firstEventAt: string | null;
  lastEventAt: string | null;
  countsByType: Record<RunEventType, number>;
  countsByStatus: Record<RunEventStatus, number>;
  totalEvents: number;
};

export type RunTimelineEventsCursor = {
  ts: string;
  id: string;
};

export type RunTimelineEventsResult = {
  items: RunTimelineEvent[];
  nextCursor: RunTimelineEventsCursor | null;
};

export type RunEventMetadata = Prisma.InputJsonValue | typeof Prisma.JsonNull | null | undefined;

export interface InvocationMessageEventArgs {
  tx?: Tx;
  runId: string;
  threadId: string;
  messageId: string;
  role: string;
  ts?: Date;
  nodeId?: string | null;
  metadata?: RunEventMetadata;
}

export interface InjectionEventArgs {
  tx?: Tx;
  runId: string;
  threadId: string;
  messageIds: string[];
  reason?: string | null;
  ts?: Date;
  nodeId?: string | null;
  metadata?: RunEventMetadata;
}

export interface LLMCallStartArgs {
  tx?: Tx;
  runId: string;
  threadId: string;
  nodeId?: string | null;
  model?: string | null;
  provider?: string | null;
  temperature?: number | null;
  topP?: number | null;
  contextItemIds?: string[];
  contextItems?: ContextItemInput[];
  metadata?: RunEventMetadata;
  sourceKind?: EventSourceKind;
  sourceSpanId?: string | null;
  idempotencyKey?: string | null;
  startedAt?: Date;
}

export interface ToolCallRecord {
  callId: string;
  name: string;
  arguments: Prisma.InputJsonValue;
}

export interface LLMCallUsageMetrics {
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
}

export interface LLMCallCompleteArgs {
  tx?: Tx;
  eventId: string;
  status: RunEventStatus;
  responseText?: string | null;
  stopReason?: string | null;
  rawResponse?: Prisma.InputJsonValue | null;
  toolCalls?: ToolCallRecord[];
  errorCode?: string | null;
  errorMessage?: string | null;
  endedAt?: Date;
  metadataPatch?: RunEventMetadata;
  usage?: LLMCallUsageMetrics;
}

export interface ToolExecutionStartArgs {
  tx?: Tx;
  runId: string;
  threadId: string;
  toolName: string;
  toolCallId?: string | null;
  llmCallEventId?: string | null;
  nodeId?: string | null;
  input: Prisma.InputJsonValue;
  metadata?: RunEventMetadata;
  startedAt?: Date;
  sourceSpanId?: string | null;
}

export interface ToolExecutionCompleteArgs {
  tx?: Tx;
  eventId: string;
  status: ToolExecStatus;
  output?: Prisma.InputJsonValue | null;
  errorMessage?: string | null;
  raw?: Prisma.InputJsonValue | null;
  endedAt?: Date;
}

export interface SummarizationEventArgs {
  tx?: Tx;
  runId: string;
  threadId: string;
  nodeId?: string | null;
  summaryText: string;
  oldContextTokens?: number | null;
  newContextCount: number;
  raw?: Prisma.InputJsonValue | null;
  metadata?: RunEventMetadata;
  ts?: Date;
}

@Injectable()
export class RunEventsService {
  private readonly events: GraphEventsPublisher;

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(GraphEventsPublisher) events: GraphEventsPublisher,
  ) {
    if (!events) {
      throw new Error('RunEventsService requires a GraphEventsPublisher provider');
    }
    this.events = events;
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private truncate(text: string | null | undefined): string | null {
    if (!text) return text ?? null;
    if (text.length <= MAX_INLINE_TEXT) return text;
    return text.slice(0, MAX_INLINE_TEXT);
  }

  private ensureJson(input: RunEventMetadata): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (input === undefined) return undefined;
    if (input === null) return Prisma.JsonNull;
    if (input === Prisma.JsonNull) return Prisma.JsonNull;
    try {
      return toPrismaJsonValue(input);
    } catch (err) {
      this.logger.warn('RunEventsService metadata serialization failed; dropping payload', err);
      return undefined;
    }
  }

  private jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    try {
      return toPrismaJsonValue(value);
    } catch (err) {
      this.logger.warn('RunEventsService payload serialization failed; storing null', err);
      return Prisma.JsonNull;
    }
  }

  private isJsonNull(value: unknown): boolean {
    return value === Prisma.JsonNull || value === Prisma.DbNull || value === Prisma.AnyNull;
  }

  private toPlainJson(value: unknown): unknown {
    if (this.isJsonNull(value)) return null;
    if (Array.isArray(value)) return value.map((entry) => this.toPlainJson(entry));
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const out: Record<string, unknown> = {};
      for (const [key, val] of entries) out[key] = this.toPlainJson(val);
      return out;
    }
    return value;
  }

  private serializeContextItem(row: ContextItemRow): SerializedContextItem {
    return {
      id: row.id,
      role: row.role,
      contentText: row.contentText ?? null,
      contentJson: this.toPlainJson(row.contentJson ?? null),
      metadata: this.toPlainJson(row.metadata ?? null),
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async resolveContextItemIds(
    tx: Tx,
    opts: { providedIds?: string[]; provided?: ContextItemInput[] },
  ): Promise<string[]> {
    const providedIds = Array.isArray(opts.providedIds)
      ? opts.providedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    if (providedIds.length > 0) return [...providedIds];

    const provided = Array.isArray(opts.provided) ? opts.provided.filter(Boolean) : [];
    if (provided.length === 0) return [];
    const normalized = normalizeContextItems(provided, this.logger);
    if (normalized.length === 0) return [];

    try {
      return await this.persistNormalizedContextItems(tx, normalized);
    } catch (err) {
      this.logger.warn('Failed to persist context items for LLM call', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async persistNormalizedContextItems(tx: Tx, items: NormalizedContextItem[]): Promise<string[]> {
    const result = await upsertNormalizedContextItems(tx, items, this.logger);
    return result.ids;
  }

  async createContextItems(items: ContextItemInput[], opts?: { tx?: Tx }): Promise<string[]> {
    const tx = opts?.tx ?? this.prisma;
    const provided = Array.isArray(items) ? items.filter(Boolean) : [];
    if (provided.length === 0) return [];
    const normalized = normalizeContextItems(provided, this.logger);
    if (normalized.length === 0) return [];
    try {
      return await this.persistNormalizedContextItems(tx, normalized);
    } catch (err) {
      this.logger.warn('Failed to create context items', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private serializeEvent(event: RunEventWithRelations): RunTimelineEvent {
    const attachments = event.attachments.map((att) => ({
      id: att.id,
      kind: att.kind,
      isGzip: att.isGzip,
      sizeBytes: att.sizeBytes,
      contentJson: this.toPlainJson(att.contentJson ?? null),
      contentText: att.contentText ?? null,
    }));
    const contextItemIds = event.llmCall?.contextItemIds ? [...event.llmCall.contextItemIds] : [];
    const llmCall = event.llmCall
      ? {
          provider: event.llmCall.provider ?? null,
          model: event.llmCall.model ?? null,
          temperature: event.llmCall.temperature ?? null,
          topP: event.llmCall.topP ?? null,
          stopReason: event.llmCall.stopReason ?? null,
          contextItemIds,
          responseText: event.llmCall.responseText ?? null,
          rawResponse: this.toPlainJson(event.llmCall.rawResponse ?? null),
          toolCalls: event.llmCall.toolCalls.map((tc) => ({
            callId: tc.callId,
            name: tc.name,
            arguments: this.toPlainJson(tc.arguments),
          })),
          usage: this.serializeUsage(event.llmCall),
        }
      : undefined;
    const toolExecution = event.toolExecution
      ? {
          toolName: event.toolExecution.toolName,
          toolCallId: event.toolExecution.toolCallId ?? null,
          execStatus: event.toolExecution.execStatus,
          input: this.toPlainJson(event.toolExecution.input),
          output: this.toPlainJson(event.toolExecution.output ?? null),
          errorMessage: event.toolExecution.errorMessage ?? null,
          raw: this.toPlainJson(event.toolExecution.raw ?? null),
        }
      : undefined;
    const summarization = event.summarization
      ? {
          summaryText: event.summarization.summaryText,
          newContextCount: event.summarization.newContextCount,
          oldContextTokens: event.summarization.oldContextTokens ?? null,
          raw: this.toPlainJson(event.summarization.raw ?? null),
        }
      : undefined;
    const injection = event.injection
      ? {
          messageIds: [...event.injection.messageIds],
          reason: event.injection.reason ?? null,
        }
      : undefined;
    const message = event.eventMessage
      ? {
          messageId: event.eventMessage.messageId,
          role: event.eventMessage.role,
          kind: event.eventMessage.message?.kind ?? null,
          text: event.eventMessage.message?.text ?? null,
          source: this.toPlainJson(event.eventMessage.message?.source ?? null),
          createdAt: event.eventMessage.message?.createdAt?.toISOString?.() ?? event.ts.toISOString(),
        }
      : undefined;

    return {
      id: event.id,
      runId: event.runId,
      threadId: event.threadId,
      type: event.type,
      status: event.status,
      ts: event.ts.toISOString(),
      startedAt: event.startedAt ? event.startedAt.toISOString() : null,
      endedAt: event.endedAt ? event.endedAt.toISOString() : null,
      durationMs: event.durationMs ?? null,
      nodeId: event.nodeId ?? null,
      sourceKind: event.sourceKind,
      sourceSpanId: event.sourceSpanId ?? null,
      metadata: this.toPlainJson(event.metadata),
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
      llmCall,
      toolExecution,
      summarization,
      injection,
      message,
      attachments,
    };
  }

  private serializeUsage(
    llmCall: RunEventWithRelations['llmCall'] | undefined,
  ): {
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
  } | undefined {
    if (!llmCall) return undefined;
    const usage = {
      inputTokens: llmCall.inputTokens ?? null,
      cachedInputTokens: llmCall.cachedInputTokens ?? null,
      outputTokens: llmCall.outputTokens ?? null,
      reasoningTokens: llmCall.reasoningTokens ?? null,
      totalTokens: llmCall.totalTokens ?? null,
    } as const;
    const hasValue = Object.values(usage).some((value) => typeof value === 'number');
    return hasValue ? usage : undefined;
  }

  private async fetchEvent(eventId: string, tx?: Tx): Promise<RunEventWithRelations | null> {
    const client = tx ?? this.prisma;
    return client.runEvent.findUnique({ where: { id: eventId }, include: RUN_EVENT_INCLUDE });
  }

  async publishEvent(eventId: string, mutation: 'append' | 'update' = 'append'): Promise<RunTimelineEvent | null> {
    try {
      const event = await this.fetchEvent(eventId);
      if (!event) return null;
      const payload = this.serializeEvent(event);
      this.events.emitRunEvent(event.runId, event.threadId, { runId: event.runId, mutation, event: payload });
      return payload;
    } catch (err) {
      this.logger.warn('Failed to publish run event', { eventId, err });
      return null;
    }
  }

  async getRunSummary(runId: string): Promise<RunTimelineSummary | null> {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { id: true, threadId: true, status: true, createdAt: true, updatedAt: true } });
    if (!run) return null;

    const [countsByTypeRows, countsByStatusRows, firstEvent, lastEvent] = await Promise.all([
      this.prisma.runEvent.groupBy({ by: ['type'], where: { runId }, _count: { _all: true } }),
      this.prisma.runEvent.groupBy({ by: ['status'], where: { runId }, _count: { _all: true } }),
      this.prisma.runEvent.findFirst({ where: { runId }, orderBy: { ts: 'asc' }, select: { ts: true } }),
      this.prisma.runEvent.findFirst({ where: { runId }, orderBy: { ts: 'desc' }, select: { ts: true } }),
    ]);

    const countsByType = RUN_EVENT_TYPES.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<RunEventType, number>);
    for (const row of countsByTypeRows) countsByType[row.type] = row._count._all;

    const countsByStatus = RUN_EVENT_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<RunEventStatus, number>);
    for (const row of countsByStatusRows) countsByStatus[row.status] = row._count._all;

    const totalEvents = countsByTypeRows.reduce((acc, row) => acc + row._count._all, 0);

    return {
      runId: run.id,
      threadId: run.threadId,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      firstEventAt: firstEvent?.ts?.toISOString() ?? null,
      lastEventAt: lastEvent?.ts?.toISOString() ?? null,
      countsByType,
      countsByStatus,
      totalEvents,
    };
  }

  async listRunEvents(params: {
    runId: string;
    types?: RunEventType[];
    statuses?: RunEventStatus[];
    limit?: number;
    order?: 'asc' | 'desc';
    cursor?: { ts: Date | string; id?: string };
  }): Promise<RunTimelineEventsResult> {
    const order: 'asc' | 'desc' = params.order === 'desc' ? 'desc' : 'asc';
    const where: Prisma.RunEventWhereInput = { runId: params.runId };
    if (params.types && params.types.length > 0) where.type = { in: params.types };
    if (params.statuses && params.statuses.length > 0) where.status = { in: params.statuses };

    const cursorTsRaw = params.cursor?.ts;
    let cursorConditions: Prisma.RunEventWhereInput | null = null;
    if (cursorTsRaw) {
      const cursorTs = cursorTsRaw instanceof Date ? cursorTsRaw : new Date(cursorTsRaw);
      if (!Number.isNaN(cursorTs.getTime())) {
        const id = params.cursor?.id;
        if (order === 'desc') {
          cursorConditions = id
            ? {
                OR: [
                  { ts: { lt: cursorTs } },
                  {
                    AND: [
                      { ts: { equals: cursorTs } },
                      { id: { lt: id } },
                    ],
                  },
                ],
              }
            : { ts: { lt: cursorTs } };
        } else {
          cursorConditions = id
            ? {
                OR: [
                  { ts: { gt: cursorTs } },
                  {
                    AND: [
                      { ts: { equals: cursorTs } },
                      { id: { gt: id } },
                    ],
                  },
                ],
              }
            : { ts: { gt: cursorTs } };
        }
      }
    }
    if (cursorConditions) {
      if (where.AND) {
        where.AND = Array.isArray(where.AND) ? [...where.AND, cursorConditions] : [where.AND, cursorConditions];
      } else {
        where.AND = cursorConditions;
      }
    }

    const limit = params.limit && Number.isFinite(params.limit) ? Math.max(1, Math.min(1000, params.limit)) : 100;
    const take = limit + 1;

    const events = await this.prisma.runEvent.findMany({
      where,
      orderBy: [{ ts: order }, { id: order }],
      take,
      include: RUN_EVENT_INCLUDE,
    });
    const hasMore = events.length > limit;
    const pageItems = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore
      ? {
          ts: pageItems[pageItems.length - 1]!.ts.toISOString(),
          id: pageItems[pageItems.length - 1]!.id,
        }
      : null;

    return {
      items: pageItems.map((ev) => this.serializeEvent(ev)),
      nextCursor,
    };
  }

  async getEventSnapshot(eventId: string): Promise<RunTimelineEvent | null> {
    const event = await this.fetchEvent(eventId);
    if (!event) return null;
    return this.serializeEvent(event);
  }

  async getContextItems(ids: string[]): Promise<SerializedContextItem[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return [];
    const rows = await this.prisma.contextItem.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        role: true,
        contentText: true,
        contentJson: true,
        metadata: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    const map = new Map(rows.map((row) => [row.id, this.serializeContextItem(row)]));
    const ordered: SerializedContextItem[] = [];
    for (const id of ids) {
      const found = map.get(id);
      if (found) ordered.push(found);
    }
    return ordered;
  }

  private async createEvent(
    tx: Tx,
    data: {
      runId: string;
      threadId: string;
      type: RunEventType;
      status?: RunEventStatus;
      ts?: Date;
      startedAt?: Date | null;
      endedAt?: Date | null;
      durationMs?: number | null;
      nodeId?: string | null;
      sourceKind?: EventSourceKind;
      sourceSpanId?: string | null;
      schemaVersion?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
      metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      idempotencyKey?: string | null;
    },
  ): Promise<RunEvent> {
    const {
      runId,
      threadId,
      type,
      status = RunEventStatus.success,
      ts,
      startedAt,
      endedAt,
      durationMs,
      nodeId,
      sourceKind = EventSourceKind.internal,
      sourceSpanId,
      schemaVersion = 1,
      errorCode,
      errorMessage,
      metadata,
      idempotencyKey,
    } = data;

    return tx.runEvent.create({
      data: {
        runId,
        threadId,
        type,
        status,
        ts: ts ?? new Date(),
        startedAt: startedAt ?? null,
        endedAt: endedAt ?? null,
        durationMs: durationMs ?? null,
        nodeId: nodeId ?? null,
        sourceKind,
        sourceSpanId: sourceSpanId ?? null,
        schemaVersion,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
        metadata: metadata ?? Prisma.JsonNull,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  }

  async recordInvocationMessage(args: InvocationMessageEventArgs): Promise<RunEvent> {
    const tx = args.tx ?? this.prisma;
    const metadata = this.ensureJson(args.metadata);
    const event = await this.createEvent(tx, {
      runId: args.runId,
      threadId: args.threadId,
      type: RunEventType.invocation_message,
      ts: args.ts,
      nodeId: args.nodeId ?? null,
      metadata,
    });
    await tx.eventMessage.create({ data: { eventId: event.id, messageId: args.messageId, role: args.role } });
    return event;
  }

  async recordInjection(args: InjectionEventArgs): Promise<RunEvent> {
    const tx = args.tx ?? this.prisma;
    const metadata = this.ensureJson(args.metadata);
    const event = await this.createEvent(tx, {
      runId: args.runId,
      threadId: args.threadId,
      type: RunEventType.injection,
      ts: args.ts,
      nodeId: args.nodeId ?? null,
      metadata,
    });
    await tx.injection.create({ data: { eventId: event.id, messageIds: args.messageIds, reason: args.reason ?? null } });
    return event;
  }

  async startLLMCall(args: LLMCallStartArgs): Promise<RunEvent> {
    const tx = args.tx ?? this.prisma;
    const metadata = this.ensureJson(args.metadata);
    const startedAt = args.startedAt ?? new Date();
    const event = await this.createEvent(tx, {
      runId: args.runId,
      threadId: args.threadId,
      type: RunEventType.llm_call,
      status: RunEventStatus.running,
      startedAt,
      nodeId: args.nodeId ?? null,
      sourceKind: args.sourceKind ?? EventSourceKind.internal,
      sourceSpanId: args.sourceSpanId ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      metadata,
    });
    const contextItemIds = await this.resolveContextItemIds(tx, {
      providedIds: args.contextItemIds,
      provided: args.contextItems,
    });
    await tx.lLMCall.create({
      data: {
        eventId: event.id,
        provider: args.provider ?? null,
        model: args.model ?? null,
        temperature: args.temperature ?? null,
        topP: args.topP ?? null,
        stopReason: null,
        contextItemIds,
        responseText: null,
        rawResponse: Prisma.JsonNull,
      },
    });
    return event;
  }

  async completeLLMCall(args: LLMCallCompleteArgs): Promise<void> {
    const tx = args.tx ?? this.prisma;
    const endedAt = args.endedAt ?? new Date();
    const status = args.status;
    const patchMetadata = this.ensureJson(args.metadataPatch);
    const existing = await tx.runEvent.findUnique({ where: { id: args.eventId }, select: { startedAt: true } });
    const durationMs = existing?.startedAt ? Math.max(0, endedAt.getTime() - existing.startedAt.getTime()) : null;
    await tx.runEvent.update({
      where: { id: args.eventId },
      data: {
        status,
        endedAt,
        durationMs,
        errorCode: args.errorCode ?? null,
        errorMessage: args.errorMessage ?? null,
        metadata: patchMetadata ?? undefined,
      },
    });

    await tx.lLMCall.update({
      where: { eventId: args.eventId },
      data: {
        stopReason: args.stopReason ?? null,
        responseText: this.truncate(args.responseText ?? null),
        rawResponse: this.jsonOrNull(args.rawResponse ?? null),
        inputTokens: args.usage?.inputTokens ?? null,
        cachedInputTokens: args.usage?.cachedInputTokens ?? null,
        outputTokens: args.usage?.outputTokens ?? null,
        reasoningTokens: args.usage?.reasoningTokens ?? null,
        totalTokens: args.usage?.totalTokens ?? null,
      },
    });

    if (Array.isArray(args.toolCalls) && args.toolCalls.length > 0) {
      await tx.toolCall.deleteMany({ where: { llmCallEventId: args.eventId } });
      await tx.toolCall.createMany({
        data: args.toolCalls.map((call, idx) => ({
          llmCallEventId: args.eventId,
          callId: call.callId,
          name: call.name,
          arguments: call.arguments,
          idx,
        })),
      });
    }
  }

  async startToolExecution(args: ToolExecutionStartArgs): Promise<RunEvent> {
    const tx = args.tx ?? this.prisma;
    const metadata = this.ensureJson(args.metadata);
    const event = await this.createEvent(tx, {
      runId: args.runId,
      threadId: args.threadId,
      type: RunEventType.tool_execution,
      status: RunEventStatus.running,
      startedAt: args.startedAt ?? new Date(),
      nodeId: args.nodeId ?? null,
      sourceSpanId: args.sourceSpanId ?? null,
      metadata,
    });
    await tx.toolExecution.create({
      data: {
        eventId: event.id,
        llmCallEventId: args.llmCallEventId ?? null,
        toolName: args.toolName,
        toolCallId: args.toolCallId ?? null,
        input: args.input,
        output: Prisma.JsonNull,
        execStatus: ToolExecStatus.success,
        errorMessage: null,
          raw: Prisma.JsonNull,
      },
    });
    return event;
  }

  async completeToolExecution(args: ToolExecutionCompleteArgs): Promise<void> {
    const tx = args.tx ?? this.prisma;
    const endedAt = args.endedAt ?? new Date();
    const execStatus = args.status;
    const event = await tx.runEvent.update({
      where: { id: args.eventId },
      data: {
        status: execStatus === ToolExecStatus.success ? RunEventStatus.success : RunEventStatus.error,
        endedAt,
        errorMessage: args.errorMessage ?? null,
      },
    });
    const durationMs = event.startedAt ? Math.max(0, endedAt.getTime() - event.startedAt.getTime()) : null;
    await tx.runEvent.update({ where: { id: args.eventId }, data: { durationMs } });

    await tx.toolExecution.update({
      where: { eventId: args.eventId },
      data: {
        execStatus,
        output: this.jsonOrNull(args.output ?? null),
        errorMessage: args.errorMessage ?? null,
        raw: this.jsonOrNull(args.raw ?? null),
      },
    });
  }

  async recordSummarization(args: SummarizationEventArgs): Promise<RunEvent> {
    const tx = args.tx ?? this.prisma;
    const metadata = this.ensureJson(args.metadata);
    const event = await this.createEvent(tx, {
      runId: args.runId,
      threadId: args.threadId,
      type: RunEventType.summarization,
      ts: args.ts,
      nodeId: args.nodeId ?? null,
      metadata,
    });
    await tx.summarization.create({
      data: {
        eventId: event.id,
        oldContextTokens: args.oldContextTokens ?? null,
        summaryText: this.truncate(args.summaryText) ?? '',
        newContextCount: args.newContextCount,
        raw: this.jsonOrNull(args.raw ?? null),
      },
    });
    return event;
  }
}
