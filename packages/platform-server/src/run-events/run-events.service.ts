import { Inject, Injectable } from '@nestjs/common';
import { EventSourceKind, Prisma, PrismaClient, RunEvent, RunEventStatus, RunEventType, ToolExecStatus } from '@prisma/client';
import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';

type Tx = PrismaClient | Prisma.TransactionClient;

const MAX_INLINE_TEXT = 32_768;
const MAX_RETRIES = 5;

export type RunEventMetadata = Prisma.InputJsonValue | null | undefined;

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
  prompt?: string | null;
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
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private async nextOrdinal(tx: Tx, runId: string): Promise<number> {
    const agg = await tx.runEvent.aggregate({ where: { runId }, _max: { ordinal: true } });
    const current = agg._max.ordinal ?? -1;
    return current + 1;
  }

  private truncate(text: string | null | undefined): string | null {
    if (!text) return text ?? null;
    if (text.length <= MAX_INLINE_TEXT) return text;
    return text.slice(0, MAX_INLINE_TEXT);
  }

  private ensureJson(input: RunEventMetadata): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (input === undefined) return undefined;
    if (input === null) return Prisma.JsonNull;
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
      metadata?: Prisma.InputJsonValue;
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

    let ordinalHint: number | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const ordinal = typeof ordinalHint === 'number' && attempt === 0 ? ordinalHint : await this.nextOrdinal(tx, runId);
      try {
        return await tx.runEvent.create({
          data: {
            runId,
            threadId,
            type,
            status,
            ordinal,
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
      } catch (err) {
        if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
          ordinalHint = ordinal + 1;
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to allocate ordinal for run event (runId=${runId})`);
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
    await tx.lLMCall.create({
      data: {
        eventId: event.id,
        provider: args.provider ?? null,
        model: args.model ?? null,
        temperature: args.temperature ?? null,
        topP: args.topP ?? null,
        stopReason: null,
        prompt: this.truncate(args.prompt ?? null),
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
