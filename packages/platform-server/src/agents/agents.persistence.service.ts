import {
  AIMessage,
  DeveloperMessage,
  HumanMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type MessageKind, type PrismaClient, type RunMessageType, type RunStatus, type ThreadStatus } from '@prisma/client';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import { PrismaService } from '../core/services/prisma.service';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import { GraphRepository } from '../graph/graph.repository';
import type { PersistedGraphNode } from '../shared/types/graph.types';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import { coerceRole } from '../llm/services/messages.normalization';
import { ChannelDescriptorSchema, type ChannelDescriptor } from '../messaging/types';
import { RunEventsService } from '../events/run-events.service';
import { EventsBusService } from '../events/events-bus.service';
import { CallAgentLinkingService } from './call-agent-linking.service';
import { ThreadsMetricsService, type ThreadMetrics } from './threads.metrics.service';
import { UserService } from '../auth/user.service';

export type RunStartResult = { runId: string };

type RunEventDelegate = Prisma.TransactionClient['runEvent'];

type DeveloperMessagePlain = {
  text: string;
  toPlain(): ResponseInputItem.Message;
};
type AgentDescriptor = { title: string; role?: string; name?: string };
type ThreadTreeNode = {
  id: string;
  alias: string;
  summary: string | null;
  status: ThreadStatus;
  createdAt: Date;
  parentId: string | null;
  metrics?: ThreadMetrics;
  agentTitle?: string;
  agentRole?: string;
  agentName?: string;
  hasChildren: boolean;
  children?: ThreadTreeNode[];
};

export class ThreadParentNotFoundError extends Error {
  constructor() {
    super('parent_not_found');
  }
}

@Injectable()
export class AgentsPersistenceService {
  private readonly logger = new Logger(AgentsPersistenceService.name);

  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(CallAgentLinkingService) private readonly callAgentLinking: CallAgentLinkingService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(UserService) private readonly users: UserService,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private sanitizeSummary(summary: string | null | undefined): string {
    return (summary ?? '').trim().slice(0, 256);
  }

  private async resolveOwnerId(ownerUserId?: string): Promise<string> {
    if (ownerUserId) return ownerUserId;
    const user = await this.users.ensureDefaultUser();
    return user.id;
  }

  private async getThreadOwnerId(threadId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const prisma = tx ?? this.prisma;
    const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { ownerUserId: true } });
    if (!thread) {
      throw new Error('thread_not_found');
    }
    return thread.ownerUserId;
  }

  async ensureThreadModel(threadId: string, model: string): Promise<string> {
    if (!model || model.trim().length === 0) {
      throw new Error('agent_model_required');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.thread.findUnique({ where: { id: threadId }, select: { modelUsed: true } });
      if (!existing) throw new Error('thread_not_found');
      if (existing.modelUsed && existing.modelUsed.trim().length > 0) {
        return existing.modelUsed;
      }

      const updated = await tx.thread.update({
        where: { id: threadId },
        data: { modelUsed: model },
        select: { modelUsed: true },
      });

      return updated.modelUsed ?? model;
    });
  }

  async setThreadChannelNode(threadId: string, channelNodeId: string | null): Promise<void> {
    const normalized = typeof channelNodeId === 'string' ? channelNodeId.trim() : null;

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.thread.findUnique({ where: { id: threadId }, select: { channelNodeId: true } });
      if (!current) throw new Error('thread_not_found');
      const currentValue = current.channelNodeId ?? null;
      if (currentValue === normalized) return null;

      return await tx.thread.update({
        where: { id: threadId },
        data: { channelNodeId: normalized },
        select: {
          id: true,
          alias: true,
          summary: true,
          status: true,
          createdAt: true,
          parentId: true,
          channelNodeId: true,
          assignedAgentNodeId: true,
          ownerUserId: true,
        },
      });
    });

    if (!updated) return;

    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
      ownerUserId: updated.ownerUserId,
      parentId: updated.parentId ?? null,
      channelNodeId: updated.channelNodeId ?? null,
      assignedAgentNodeId: updated.assignedAgentNodeId ?? null,
    });
  }

  /**
   * Resolve a UUID threadId for a globally-unique alias. Alias is only used at ingress.
   */
  async getOrCreateThreadByAlias(
    _source: string,
    alias: string,
    summary: string,
    options?: { channelNodeId?: string; ownerUserId?: string },
  ): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias }, select: { id: true } });
    if (existing) return existing.id;
    const sanitized = this.sanitizeSummary(summary);
    const ownerUserId = await this.resolveOwnerId(options?.ownerUserId);
    const created = await this.prisma.thread.create({
      data: {
        alias,
        summary: sanitized,
        ownerUserId,
        ...(options?.channelNodeId ? { channelNodeId: options.channelNodeId } : {}),
      },
    });
    this.eventsBus.emitThreadCreated({
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
      ownerUserId,
      parentId: created.parentId ?? null,
      channelNodeId: created.channelNodeId ?? null,
      assignedAgentNodeId: created.assignedAgentNodeId ?? null,
    });
    return created.id;
  }

  /**
   * Populate thread channel descriptor if not set.
   */
  async updateThreadChannelDescriptor(threadId: string, descriptor: ChannelDescriptor): Promise<void> {
    const existing = await this.prisma.thread.findUnique({ where: { id: threadId }, select: { channel: true } });
    if (existing?.channel) return; // do not overwrite
    const parsed = ChannelDescriptorSchema.safeParse(descriptor);
    if (!parsed.success) {
      this.logger.error(
        `Invalid channel descriptor; skipping persistence${this.format({ threadId, issues: parsed.error.issues })}`,
      );
      return;
    }
    const channelJson = toPrismaJsonValue(parsed.data);
    const updated = await this.prisma.thread.update({
      where: { id: threadId },
      data: { channel: channelJson },
      select: {
        id: true,
        alias: true,
        summary: true,
        status: true,
        createdAt: true,
        parentId: true,
        channelNodeId: true,
        assignedAgentNodeId: true,
        ownerUserId: true,
      },
    });
    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
      ownerUserId: updated.ownerUserId,
      parentId: updated.parentId ?? null,
      channelNodeId: updated.channelNodeId ?? null,
      assignedAgentNodeId: updated.assignedAgentNodeId ?? null,
    });
  }

  /**
   * Resolve a child UUID threadId for a subthread alias under a parent threadId.
   * Alias must be globally unique; we compose alias using parent to satisfy uniqueness.
   */
  async getOrCreateSubthreadByAlias(source: string, alias: string, parentThreadId: string, summary: string): Promise<string> {
    const composed = `${source}:${parentThreadId}:${alias}`;
    const existing = await this.prisma.thread.findUnique({ where: { alias: composed } });
    if (existing) return existing.id;
    const parent = await this.prisma.thread.findUnique({ where: { id: parentThreadId }, select: { id: true, ownerUserId: true } });
    if (!parent) {
      throw new ThreadParentNotFoundError();
    }
    const sanitized = this.sanitizeSummary(summary);
    const created = await this.prisma.thread.create({
      data: { alias: composed, parentId: parentThreadId, summary: sanitized, ownerUserId: parent.ownerUserId },
    });
    this.eventsBus.emitThreadCreated({
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
      ownerUserId: created.ownerUserId,
      parentId: created.parentId ?? null,
      channelNodeId: created.channelNodeId ?? null,
      assignedAgentNodeId: created.assignedAgentNodeId ?? null,
    });
    this.eventsBus.emitThreadMetricsAncestors({ threadId: created.id });
    return created.id;
  }

  async createThreadWithInitialMessage(params: {
    alias: string;
    text: string;
    agentNodeId: string;
    ownerUserId: string;
    parentId?: string | null;
  }): Promise<{
    id: string;
    alias: string;
    summary: string | null;
    status: ThreadStatus;
    createdAt: Date;
    parentId: string | null;
    channelNodeId: string | null;
    assignedAgentNodeId: string | null;
    ownerUserId: string;
  }> {
    const alias = params.alias.trim();
    if (alias.length === 0) {
      throw new Error('thread_alias_required');
    }
    const agentNodeId = params.agentNodeId.trim();
    if (agentNodeId.length === 0) {
      throw new Error('agent_node_id_required');
    }
    const parentId = params.parentId ?? null;
    const sanitizedSummary = this.sanitizeSummary(params.text);
    const ownerUserId = await this.resolveOwnerId(params.ownerUserId);

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (parentId) {
        const parent = await tx.thread.findUnique({ where: { id: parentId }, select: { id: true, ownerUserId: true } });
        if (!parent) {
          throw new ThreadParentNotFoundError();
        }
        if (parent.ownerUserId !== ownerUserId) {
          throw new Error('thread_parent_owner_mismatch');
        }
      }

      return tx.thread.create({
        data: {
          alias,
          summary: sanitizedSummary,
          parentId,
          assignedAgentNodeId: agentNodeId,
          ownerUserId,
        },
      });
    });

    this.eventsBus.emitThreadCreated({
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
      ownerUserId: created.ownerUserId,
      parentId: created.parentId ?? null,
      channelNodeId: created.channelNodeId ?? null,
      assignedAgentNodeId: created.assignedAgentNodeId ?? null,
    });

    if (created.parentId) {
      this.eventsBus.emitThreadMetricsAncestors({ threadId: created.id });
    }

    return {
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
      ownerUserId: created.ownerUserId,
      parentId: created.parentId ?? null,
      channelNodeId: created.channelNodeId ?? null,
      assignedAgentNodeId: created.assignedAgentNodeId ?? null,
    };
  }

  async ensureAssignedAgent(threadId: string, agentNodeId: string): Promise<void> {
    const normalized = typeof agentNodeId === 'string' ? agentNodeId.trim() : '';
    if (!normalized) return;
    const result = await this.prisma.thread.updateMany({
      where: { id: threadId, assignedAgentNodeId: null },
      data: { assignedAgentNodeId: normalized },
    });
    if (result.count === 0) return;
    const updated = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        alias: true,
        summary: true,
        status: true,
        createdAt: true,
        parentId: true,
        channelNodeId: true,
        assignedAgentNodeId: true,
        ownerUserId: true,
      },
    });
    if (!updated) return;
    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
      ownerUserId: updated.ownerUserId,
      parentId: updated.parentId ?? null,
      channelNodeId: updated.channelNodeId ?? null,
      assignedAgentNodeId: updated.assignedAgentNodeId ?? null,
    });
  }

  /**
   * Resolve a UUID threadId by alias (helper for controllers/tests).
   */
  async resolveThreadId(alias: string): Promise<string | null> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    return existing?.id ?? null;
  }

  /**
   * Begin a run and persist input messages for an existing threadId.
   */
  async beginRunThread(
    threadId: string,
    inputMessages: Array<HumanMessage | DeveloperMessage | SystemMessage | AIMessage>,
    agentNodeId?: string,
  ): Promise<RunStartResult> {
    const ownerUserId = await this.getThreadOwnerId(threadId);
    const { runId, createdMessages, eventIds, patchedEventIds } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Begin run and persist messages
      const run = await tx.run.create({ data: { threadId, status: 'running' as RunStatus } });
      const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
      const eventIds: string[] = [];
      const patchedEventIds: string[] = [];
      await Promise.all(
        inputMessages.map(async (msg) => {
          const normalized = this.normalizeToUserMessage(msg);
          const text = normalized.text ?? null;
          const source = toPrismaJsonValue(normalized.toPlain());
          const created = await tx.message.create({
            data: { kind: 'user' as MessageKind, text, source },
          });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
          const event = await this.runEvents.recordInvocationMessage({
            tx,
            runId: run.id,
            threadId,
            messageId: created.id,
            role: 'user',
            ts: created.createdAt,
            metadata: { messageType: 'input' },
          });
          eventIds.push(event.id);
          createdMessages.push({
            id: created.id,
            kind: 'user' as MessageKind,
            text,
            source: created.source as Prisma.JsonValue,
            createdAt: created.createdAt,
          });
        }),
      );
      const linkedEventId = await this.callAgentLinking.onChildRunStarted({
        tx,
        childThreadId: threadId,
        runId: run.id,
        latestMessageId: createdMessages[0]?.id ?? null,
      });
      if (linkedEventId) patchedEventIds.push(linkedEventId);
      return { runId: run.id, createdMessages, eventIds, patchedEventIds };
    });
    this.eventsBus.emitRunStatusChanged({
      threadId,
      ownerUserId,
      run: { id: runId, status: 'running' as RunStatus, createdAt: new Date(), updatedAt: new Date() },
    });
    for (const m of createdMessages) {
      this.eventsBus.emitMessageCreated({
        threadId,
        ownerUserId,
        message: { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId },
      });
    }
    this.eventsBus.emitThreadMetrics({ threadId });
    await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));
    if (agentNodeId) await this.ensureAssignedAgent(threadId, agentNodeId);
    return { runId };
  }

  /**
   * Persist injected messages. Only DeveloperMessage injections are supported (SystemMessage retained for legacy callers).
   */
  async recordInjected(
    runId: string,
    injectedMessages: Array<HumanMessage | DeveloperMessage | SystemMessage | AIMessage>,
    options?: { threadId?: string },
  ): Promise<{ messageIds: string[] }> {
    if (!injectedMessages.length) return { messageIds: [] };

    const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
    const eventIds: string[] = [];
    const patchedEventIds: string[] = [];
    let threadId: string | null = options?.threadId ?? null;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.run.findUnique({ where: { id: runId }, select: { threadId: true } });
      if (!run) throw new Error(`run_not_found:${runId}`);
      const resolvedThreadId = options?.threadId ?? run.threadId;
      threadId = resolvedThreadId;

      for (const msg of injectedMessages) {
        const normalized = this.normalizeToUserMessage(msg);
        const text = normalized.text ?? null;
        const source = toPrismaJsonValue(normalized.toPlain());
        const created = await tx.message.create({
          data: { kind: 'user' as MessageKind, text, source },
        });
        await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
        const event = await this.runEvents.recordInvocationMessage({
          tx,
          runId,
          threadId: resolvedThreadId,
          messageId: created.id,
          role: 'user',
          ts: created.createdAt,
          metadata: { messageType: 'injected' },
        });
        eventIds.push(event.id);
        createdMessages.push({
          id: created.id,
          kind: 'user' as MessageKind,
          text,
          source: created.source as Prisma.JsonValue,
          createdAt: created.createdAt,
        });
      }

      if (createdMessages.length > 0) {
        const inj = await this.runEvents.recordInjection({
          tx,
          runId,
          threadId: resolvedThreadId,
          messageIds: createdMessages.map((m) => m.id),
          ts: createdMessages[0].createdAt,
        });
        eventIds.push(inj.id);
        const linkedEventId = await this.callAgentLinking.onChildRunMessage({
          tx,
          runId,
          latestMessageId: createdMessages[0]?.id ?? null,
        });
        if (linkedEventId) patchedEventIds.push(linkedEventId);
      }
    });

    if (!threadId) return { messageIds: [] };

    if (threadId) {
      const ownerUserId = await this.getThreadOwnerId(threadId);
      for (const m of createdMessages) {
        this.eventsBus.emitMessageCreated({
          threadId,
          ownerUserId,
          message: {
            id: m.id,
            kind: m.kind,
            text: m.text,
            source: m.source as Prisma.JsonValue,
            createdAt: m.createdAt,
            runId,
          },
        });
      }
    }

    await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));

    return { messageIds: createdMessages.map((m) => m.id) };
  }

  async recordTransportAssistantMessage(params: {
    threadId: string;
    text: string;
    runId?: string | null;
    source?: string | null;
  }): Promise<{ messageId: string }> {
    const normalizedThreadId = params.threadId?.trim();
    if (!normalizedThreadId) throw new Error('thread_id_required');
    const ownerUserId = await this.getThreadOwnerId(normalizedThreadId);

    const assistant = AIMessage.fromText(params.text ?? '');
    const sourcePayload = toPrismaJsonValue(assistant.toPlain());
    const eventIds: string[] = [];
    const patchedEventIds: string[] = [];

    const suppressInvocationEvent = params.source === 'send_message';

    const { message, runId } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.message.create({
        data: {
          kind: 'assistant' as MessageKind,
          text: assistant.text,
          source: sourcePayload,
        },
      });

      let linkedRunId: string | null = null;
      if (params.runId) {
        const run = await tx.run.findUnique({ where: { id: params.runId }, select: { threadId: true } });
        if (!run) throw new Error(`run_not_found:${params.runId}`);
        if (run.threadId !== normalizedThreadId) {
          throw new Error(`run_thread_mismatch:${params.runId}`);
        }
        linkedRunId = params.runId;
        await tx.runMessage.create({ data: { runId: linkedRunId, messageId: created.id, type: 'output' as RunMessageType } });
        if (!suppressInvocationEvent) {
          const event = await this.runEvents.recordInvocationMessage({
            tx,
            runId: linkedRunId,
            threadId: normalizedThreadId,
            messageId: created.id,
            role: 'assistant',
            ts: created.createdAt,
            metadata: { messageType: 'transport', source: params.source ?? 'thread_transport' },
          });
          eventIds.push(event.id);
        }
        const linkedEventId = await this.callAgentLinking.onChildRunMessage({
          tx,
          runId: linkedRunId,
          latestMessageId: created.id,
        });
        if (linkedEventId) patchedEventIds.push(linkedEventId);
      }

      return { message: created, runId: linkedRunId };
    });

    this.eventsBus.emitMessageCreated({
      threadId: normalizedThreadId,
      ownerUserId,
      message: {
        id: message.id,
        kind: 'assistant' as MessageKind,
        text: message.text,
        source: message.source as Prisma.JsonValue,
        createdAt: message.createdAt,
        runId: runId ?? undefined,
      },
    });

    if (eventIds.length > 0) {
      await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    }
    if (patchedEventIds.length > 0) {
      await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));
    }

    return { messageId: message.id };
  }

  /**
   * Complete a run and persist output messages. Accepts strictly typed output message instances.
   */
  async completeRun(
    runId: string,
    status: RunStatus,
    outputMessages: Array<AIMessage | ToolCallMessage | ToolCallOutputMessage>,
  ): Promise<void> {
    const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
    const eventIds: string[] = [];
    const patchedEventIds: string[] = [];
    const run = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.run.findUnique({ where: { id: runId }, select: { id: true, threadId: true, createdAt: true, updatedAt: true } });
      if (!current) throw new Error(`run_not_found:${runId}`);
      const threadId = current.threadId;
      for (const msg of outputMessages) {
        const normalized = this.normalizeForPersistence(msg);
        const { kind, text } = this.deriveKindTextTyped(normalized);
        if (kind === ('tool' as MessageKind)) continue;
        const source = toPrismaJsonValue(normalized.toPlain());
        const created = await tx.message.create({ data: { kind, text, source } });
        await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'output' as RunMessageType } });
        const event = await this.runEvents.recordInvocationMessage({
          tx,
          runId,
          threadId,
          messageId: created.id,
          role: kind,
          ts: created.createdAt,
          metadata: { messageType: 'output' },
        });
        eventIds.push(event.id);
        createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
      }
      const updated = await tx.run.update({ where: { id: runId }, data: { status } });
      const linkedEventId = await this.callAgentLinking.onChildRunCompleted({ tx, runId, status });
      if (linkedEventId) patchedEventIds.push(linkedEventId);
      return updated;
    });
    const threadId = run.threadId;
    const ownerUserId = await this.getThreadOwnerId(threadId);
    for (const m of createdMessages) {
      this.eventsBus.emitMessageCreated({
        threadId,
        ownerUserId,
        message: { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId },
      });
    }
    this.eventsBus.emitRunStatusChanged({
      threadId,
      ownerUserId,
      run: { id: runId, status, createdAt: run.createdAt, updatedAt: run.updatedAt },
    });
    this.eventsBus.emitThreadMetrics({ threadId });
    await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));
  }

  async listThreadsTree(opts: {
    status: 'open' | 'closed' | 'all';
    limit: number;
    depth: 0 | 1 | 2;
    includeMetrics: boolean;
    includeAgentTitles: boolean;
    childrenStatus: 'open' | 'closed' | 'all';
    perParentChildrenLimit: number;
    ownerUserId?: string;
  }): Promise<ThreadTreeNode[]> {
    const limit = Math.min(Math.max(opts.limit, 1), 1000);
    const depth = Math.min(Math.max(opts.depth, 0), 2) as 0 | 1 | 2;
    const perParentLimit = Math.min(Math.max(opts.perParentChildrenLimit, 1), 1000);
    const status = opts.status;
    const childrenStatus = opts.childrenStatus;

    const rootWhere: Prisma.ThreadWhereInput = { parentId: null };
    if (status !== 'all') rootWhere.status = status as ThreadStatus;
    if (opts.ownerUserId) rootWhere.ownerUserId = opts.ownerUserId;

    const rootRows = await this.prisma.thread.findMany({
      where: rootWhere,
      orderBy: { createdAt: 'desc' },
      select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true },
      take: limit,
    });

    if (rootRows.length === 0) {
      return [];
    }

    type Row = { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId: string | null };

    const nodeById = new Map<string, ThreadTreeNode>();
    const createNode = (row: Row): ThreadTreeNode => {
      const node: ThreadTreeNode = {
        id: row.id,
        alias: row.alias,
        summary: row.summary ?? null,
        status: row.status,
        createdAt: row.createdAt,
        parentId: row.parentId,
        hasChildren: false,
      };
      nodeById.set(node.id, node);
      return node;
    };

    const rootNodes = rootRows.map(createNode);
    const rootIds = rootNodes.map((node) => node.id);

    const attachChildren = (rows: Row[]): string[] => {
      if (rows.length === 0) return [];
      const grouped = new Map<string, Row[]>();
      for (const row of rows) {
        if (!row.parentId) continue;
        const list = grouped.get(row.parentId) ?? [];
        list.push(row);
        if (!grouped.has(row.parentId)) grouped.set(row.parentId, list);
      }
      const attachedIds: string[] = [];
      for (const [parentId, group] of grouped.entries()) {
        const parent = nodeById.get(parentId);
        if (!parent) continue;
        group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const limited = group.slice(0, perParentLimit);
        if (limited.length === 0) continue;
        const children = limited.map(createNode);
        parent.children = children;
        for (const child of children) attachedIds.push(child.id);
      }
      return attachedIds;
    };

    let childIds: string[] = [];
    if (depth >= 1) {
      const childWhere: Prisma.ThreadWhereInput = { parentId: { in: rootIds } };
      if (childrenStatus !== 'all') childWhere.status = childrenStatus as ThreadStatus;
      if (opts.ownerUserId) childWhere.ownerUserId = opts.ownerUserId;
      const childRows = await this.prisma.thread.findMany({
        where: childWhere,
        select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true },
      });
      childIds = attachChildren(childRows);
    }

    if (depth >= 2 && childIds.length > 0) {
      const grandchildWhere: Prisma.ThreadWhereInput = { parentId: { in: childIds } };
      if (childrenStatus !== 'all') grandchildWhere.status = childrenStatus as ThreadStatus;
      if (opts.ownerUserId) grandchildWhere.ownerUserId = opts.ownerUserId;
      const grandchildRows = await this.prisma.thread.findMany({
        where: grandchildWhere,
        select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true },
      });
      attachChildren(grandchildRows);
    }

    const allIds = Array.from(nodeById.keys());

    const [metricsById, descriptorsById] = await Promise.all([
      opts.includeMetrics && allIds.length > 0
        ? this.getThreadsMetrics(allIds)
        : Promise.resolve<Record<string, ThreadMetrics>>({}),
      allIds.length > 0 ? this.getThreadsAgentDescriptors(allIds) : Promise.resolve<Record<string, AgentDescriptor>>({}),
    ]);

    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';

    for (const node of nodeById.values()) {
      const descriptor = descriptorsById[node.id];
      node.agentRole = descriptor?.role ?? undefined;
      node.agentName = descriptor?.name ?? undefined;
      if (opts.includeAgentTitles) {
        node.agentTitle = descriptor?.title ?? fallbackTitle;
      }
      if (opts.includeMetrics) {
        node.metrics = { ...defaultMetrics, ...(metricsById[node.id] ?? {}) };
      }
    }

    const countsMap = new Map<string, number>();
    if (allIds.length > 0) {
      const countWhere: Prisma.ThreadWhereInput = { parentId: { in: allIds } };
      if (childrenStatus !== 'all') countWhere.status = childrenStatus as ThreadStatus;
      const grouped = await this.prisma.thread.groupBy({
        by: ['parentId'],
        where: countWhere,
        _count: { _all: true },
      });
      for (const row of grouped) {
        if (!row.parentId) continue;
        countsMap.set(row.parentId, row._count._all);
      }
    }

    for (const node of nodeById.values()) {
      const total = countsMap.get(node.id) ?? 0;
      node.hasChildren = total > 0;
      if (!node.children || node.children.length === 0) {
        if (node.children && node.children.length === 0) {
          delete node.children;
        }
      }
    }

    const clone = (node: ThreadTreeNode): ThreadTreeNode => {
      const base: ThreadTreeNode = {
        id: node.id,
        alias: node.alias,
        summary: node.summary,
        status: node.status,
        createdAt: node.createdAt,
        parentId: node.parentId,
        hasChildren: node.hasChildren,
      };
      if (node.metrics) base.metrics = node.metrics;
      if (node.agentTitle) base.agentTitle = node.agentTitle;
      if (node.agentRole) base.agentRole = node.agentRole;
      if (node.agentName) base.agentName = node.agentName;
      if (node.children && node.children.length > 0) {
        base.children = node.children.map(clone);
      }
      return base;
    };

    return rootNodes.map(clone);
  }

  async listThreads(opts?: {
    rootsOnly?: boolean;
    status?: 'open' | 'closed' | 'all';
    limit?: number;
    ownerUserId?: string;
  }): Promise<Array<{ id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }>> {
    const rootsOnly = opts?.rootsOnly ?? false;
    const status = opts?.status ?? 'all';
    const limit = opts?.limit ?? 100;
    const where: Prisma.ThreadWhereInput = {};
    if (rootsOnly) where.parentId = null;
    if (status !== 'all') where.status = status as ThreadStatus;
    if (opts?.ownerUserId) where.ownerUserId = opts.ownerUserId;
    return this.prisma.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true },
      take: limit,
    });
  }

  async getThreadById(
    threadId: string,
    opts?: { includeMetrics?: boolean; includeAgentTitles?: boolean; ownerUserId?: string },
  ): Promise<
    | ({
        id: string;
        alias: string;
        summary: string | null;
        status: ThreadStatus;
        createdAt: Date;
        parentId: string | null;
        assignedAgentNodeId: string | null;
        ownerUserId: string;
        metrics?: ThreadMetrics;
        agentTitle?: string;
        agentRole?: string;
        agentName?: string;
      })
    | null
  > {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, ...(opts?.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}) },
      select: {
        id: true,
        alias: true,
        summary: true,
        status: true,
        createdAt: true,
        parentId: true,
        assignedAgentNodeId: true,
        ownerUserId: true,
      },
    });
    if (!thread) return null;

    const includeMetrics = opts?.includeMetrics ?? false;
    const includeAgentTitles = opts?.includeAgentTitles ?? false;

    const result: {
      id: string;
      alias: string;
      summary: string | null;
      status: ThreadStatus;
      createdAt: Date;
      parentId: string | null;
      assignedAgentNodeId: string | null;
      ownerUserId: string;
      metrics?: ThreadMetrics;
      agentTitle?: string;
      agentRole?: string;
      agentName?: string;
    } = {
      ...thread,
      parentId: thread.parentId ?? null,
      assignedAgentNodeId: thread.assignedAgentNodeId ?? null,
      ownerUserId: thread.ownerUserId,
    };

    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';

    const [metrics, descriptors] = await Promise.all([
      includeMetrics ? this.getThreadsMetrics([thread.id]) : Promise.resolve<Record<string, ThreadMetrics>>({}),
      this.getThreadsAgentDescriptors([thread.id]),
    ]);

    const descriptor = descriptors[thread.id];

    if (includeMetrics) {
      result.metrics = metrics[thread.id] ?? defaultMetrics;
    }

    result.agentRole = descriptor?.role ?? undefined;
    result.agentName = descriptor?.name ?? undefined;

    if (includeAgentTitles) {
      result.agentTitle = descriptor?.title ?? fallbackTitle;
    }

    return result;
  }

  async getLatestAgentNodeIdForThread(
    threadId: string,
    options?: { candidateNodeIds?: string[] },
  ): Promise<string | null> {
    const candidateNodeIds = options?.candidateNodeIds;
    if (candidateNodeIds && candidateNodeIds.length === 0) return null;
    const prisma = this.prisma;
    const where: Prisma.ConversationStateWhereInput = { threadId };
    if (candidateNodeIds && candidateNodeIds.length > 0) {
      where.nodeId = { in: candidateNodeIds };
    }
    const state = await prisma.conversationState.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { nodeId: true },
    });
    return state?.nodeId ?? null;
  }

  async listChildren(
    parentId: string,
    status: 'open' | 'closed' | 'all' = 'all',
    ownerUserId?: string,
  ): Promise<Array<{ id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }>> {
    const where: Prisma.ThreadWhereInput = { parentId };
    if (status !== 'all') where.status = status as ThreadStatus;
    if (ownerUserId) where.ownerUserId = ownerUserId;
    return this.prisma.thread.findMany({ where, orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true } });
  }

  async updateThread(
    threadId: string,
    data: { summary?: string | null; status?: ThreadStatus },
    scope?: { ownerUserId?: string },
  ): Promise<{ previousStatus: ThreadStatus; status: ThreadStatus }> {
    const patch: Prisma.ThreadUpdateInput = {};
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.status !== undefined) patch.status = data.status;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.thread.findFirst({
        where: { id: threadId, ...(scope?.ownerUserId ? { ownerUserId: scope.ownerUserId } : {}) },
        select: { status: true },
      });
      if (!current) {
        throw new Error('thread_not_found');
      }
      const updated = await tx.thread.update({ where: { id: threadId }, data: patch });
      return { updated, previousStatus: current?.status ?? updated.status };
    });

    const updated = result.updated;
    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
      ownerUserId: updated.ownerUserId,
      parentId: updated.parentId ?? null,
      channelNodeId: updated.channelNodeId ?? null,
      assignedAgentNodeId: updated.assignedAgentNodeId ?? null,
    });
    return { previousStatus: result.previousStatus, status: updated.status };
  }

  /** Aggregate subtree metrics for provided root IDs. */
  async getThreadsMetrics(ids: string[]): Promise<Record<string, ThreadMetrics>> {
    if (!ids || ids.length === 0) return {};
    const [metrics, runs] = await Promise.all([this.metrics.getThreadsMetrics(ids), this.getRunsCount(ids)]);
    const out: Record<string, ThreadMetrics> = {};
    for (const id of ids) {
      const base = metrics[id] ?? { remindersCount: 0, containersCount: 0, activity: 'idle' as const };
      out[id] = { ...base, runsCount: runs[id] ?? 0 };
    }
    return out;
  }

  async getThreadsAgentDescriptors(ids: string[]): Promise<Record<string, AgentDescriptor>> {
    if (!ids || ids.length === 0) return {};
    try {
      return await this.resolveAgentDescriptors(ids);
    } catch (err) {
      this.logger.error(
        `AgentsPersistenceService failed to resolve agent descriptors ${this.format({ error: this.errorInfo(err) })}`,
      );
      const fallback = '(unknown agent)';
      return Object.fromEntries(ids.map((id) => [id, { title: fallback } as AgentDescriptor]));
    }
  }

  async getThreadsAgentTitles(ids: string[]): Promise<Record<string, string>> {
    if (!ids || ids.length === 0) return {};
    const descriptors = await this.getThreadsAgentDescriptors(ids);
    const fallback = '(unknown agent)';
    const out: Record<string, string> = {};
    for (const id of ids) {
      out[id] = descriptors[id]?.title ?? fallback;
    }
    return out;
  }

  async getThreadsAgentRoles(ids: string[]): Promise<Record<string, string>> {
    if (!ids || ids.length === 0) return {};
    const descriptors = await this.getThreadsAgentDescriptors(ids);
    const out: Record<string, string> = {};
    for (const id of ids) {
      const role = descriptors[id]?.role;
      if (role) {
        out[id] = role;
      }
    }
    return out;
  }

  async listRuns(
    threadId: string,
    take: number = 100,
  ): Promise<Array<{ id: string; status: RunStatus; createdAt: Date; updatedAt: Date }>> {
    return this.prisma.run.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true, updatedAt: true },
      take,
    });
  }

  async getRunById(
    runId: string,
    scope?: { ownerUserId?: string },
  ): Promise<{ id: string; threadId: string; status: RunStatus } | null> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, threadId: true, status: true, thread: { select: { ownerUserId: true } } },
    });
    if (!run) return null;
    if (scope?.ownerUserId && run.thread.ownerUserId !== scope.ownerUserId) {
      return null;
    }
    return { id: run.id, threadId: run.threadId, status: run.status };
  }

  async listRunMessages(runId: string, type: RunMessageType): Promise<Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }>> {
    const links = await this.prisma.runMessage.findMany({ where: { runId, type }, select: { messageId: true } });
    if (links.length === 0) return [];
    const msgIds = links.map(({ messageId }) => messageId);
    const msgs = await this.prisma.message.findMany({ where: { id: { in: msgIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, text: true, source: true, createdAt: true } });
    return msgs;
  }

  async listReminders(
    filter: 'active' | 'completed' | 'cancelled' | 'all' = 'active',
    take: number = 100,
    threadId?: string,
    ownerUserId?: string,
  ): Promise<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null }>> {
    const limit = Number.isFinite(take) ? Math.min(1000, Math.max(1, Math.trunc(take))) : 100;
    const where: Prisma.ReminderWhereInput = {};
    if (filter === 'active') {
      where.completedAt = null;
      where.cancelledAt = null;
    } else if (filter === 'completed') {
      where.NOT = { completedAt: null };
    } else if (filter === 'cancelled') {
      where.NOT = { cancelledAt: null };
    }
    if (threadId) where.threadId = threadId;
    if (ownerUserId) where.thread = { ownerUserId };

    try {
      return await this.prisma.reminder.findMany({
        where: Object.keys(where).length === 0 ? undefined : where,
        orderBy: { at: 'asc' },
        select: { id: true, threadId: true, note: true, at: true, createdAt: true, completedAt: true, cancelledAt: true },
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to list reminders${this.format({
          filter,
          take: limit,
          threadId,
          error: this.errorInfo(error),
        })}`,
      );
      throw error;
    }
  }

  async listRemindersPaginated({
    filter = 'all',
    page = 1,
    pageSize = 20,
    sort = 'latest',
    order = 'desc',
    threadId,
    ownerUserId,
  }: {
    filter?: 'all' | 'active' | 'completed' | 'cancelled';
    page?: number;
    pageSize?: number;
    sort?: 'latest' | 'createdAt' | 'at';
    order?: 'asc' | 'desc';
    threadId?: string;
    ownerUserId?: string;
  }): Promise<{
    items: Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null }>;
    page: number;
    pageSize: number;
    totalCount: number;
    pageCount: number;
    countsByStatus: { scheduled: number; executed: number; cancelled: number };
    sortApplied: { key: 'latest' | 'createdAt' | 'at'; order: 'asc' | 'desc' };
  }> {
    const parsedPage = Number(page);
    const normalizedPage = Number.isFinite(parsedPage) ? Math.max(1, Math.trunc(parsedPage)) : 1;
    const parsedPageSize = Number(pageSize);
    const normalizedPageSize = Number.isFinite(parsedPageSize)
      ? Math.max(1, Math.min(200, Math.trunc(parsedPageSize)))
      : 20;
    const sortKey: 'latest' | 'createdAt' | 'at' = sort ?? 'latest';
    const sortOrder: 'asc' | 'desc' = order === 'asc' ? 'asc' : 'desc';
    const filterKey: 'all' | 'active' | 'completed' | 'cancelled' = filter ?? 'all';

    const skip = (normalizedPage - 1) * normalizedPageSize;
    const { where, clauses } = this.buildReminderFilter(filterKey, threadId, ownerUserId);
    const whereForQuery = Object.keys(where).length === 0 ? undefined : where;
    const countsBaseWhere: Prisma.ReminderWhereInput = {};
    if (threadId) countsBaseWhere.threadId = threadId;
    if (ownerUserId) countsBaseWhere.thread = { ownerUserId };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [totalCount, scheduledCount, executedCount, cancelledCount] = await Promise.all([
          tx.reminder.count({ where: whereForQuery }),
          tx.reminder.count({
            where: {
              ...countsBaseWhere,
              completedAt: null,
              cancelledAt: null,
            },
          }),
          tx.reminder.count({
            where: {
              ...countsBaseWhere,
              completedAt: { not: null },
            },
          }),
          tx.reminder.count({
            where: {
              ...countsBaseWhere,
              cancelledAt: { not: null },
            },
          }),
        ]);

        const useLatestAllOptimization = sortKey === 'latest' && filterKey === 'all' && !ownerUserId;
        const items =
          useLatestAllOptimization
            ? await this.fetchRemindersLatestAll(tx, clauses, skip, normalizedPageSize, sortOrder)
            : await tx.reminder.findMany({
                where: whereForQuery,
                orderBy: this.buildReminderOrder(sortKey, sortOrder, filterKey),
                skip,
                take: normalizedPageSize,
                select: {
                  id: true,
                  threadId: true,
                  note: true,
                  at: true,
                  createdAt: true,
                  completedAt: true,
                  cancelledAt: true,
                },
              });

        const pageCount = totalCount === 0 ? 0 : Math.ceil(totalCount / normalizedPageSize);

        return {
          items,
          page: normalizedPage,
          pageSize: normalizedPageSize,
          totalCount,
          pageCount,
          countsByStatus: {
            scheduled: scheduledCount,
            executed: executedCount,
            cancelled: cancelledCount,
          },
          sortApplied: { key: sortKey, order: sortOrder },
        };
      });
    } catch (error) {
      this.logger.error(
        `Failed to list reminders (paginated)${this.format({
          filter: filterKey,
          page: normalizedPage,
          pageSize: normalizedPageSize,
          sort: sortKey,
          order: sortOrder,
          threadId,
          ownerUserId,
          error: this.errorInfo(error),
        })}`,
      );
      throw error;
    }
  }

  private buildReminderFilter(
    filter: 'all' | 'active' | 'completed' | 'cancelled',
    threadId?: string,
    ownerUserId?: string,
  ): { where: Prisma.ReminderWhereInput; clauses: Prisma.Sql[] } {
    const where: Prisma.ReminderWhereInput = {};
    const clauses: Prisma.Sql[] = [];

    if (threadId) {
      where.threadId = threadId;
      clauses.push(Prisma.sql`"threadId" = ${threadId}`);
    }

    if (ownerUserId) {
      where.thread = { ownerUserId };
    }

    switch (filter) {
      case 'active':
        where.completedAt = null;
        where.cancelledAt = null;
        clauses.push(Prisma.sql`"completedAt" IS NULL`);
        clauses.push(Prisma.sql`"cancelledAt" IS NULL`);
        break;
      case 'completed':
        where.completedAt = { not: null };
        clauses.push(Prisma.sql`"completedAt" IS NOT NULL`);
        break;
      case 'cancelled':
        where.cancelledAt = { not: null };
        clauses.push(Prisma.sql`"cancelledAt" IS NOT NULL`);
        break;
      default:
        break;
    }

    return { where, clauses };
  }

  private buildReminderOrder(
    sort: 'latest' | 'createdAt' | 'at',
    order: 'asc' | 'desc',
    filter: 'all' | 'active' | 'completed' | 'cancelled',
  ): Prisma.ReminderOrderByWithRelationInput {
    if (sort === 'at') {
      return { at: order };
    }

    if (sort === 'createdAt') {
      return { createdAt: order };
    }

    if (sort === 'latest') {
      if (filter === 'completed') return { completedAt: order };
      if (filter === 'cancelled') return { cancelledAt: order };
    }

    return { createdAt: order };
  }

  private async fetchRemindersLatestAll(
    tx: Prisma.TransactionClient,
    clauses: Prisma.Sql[],
    skip: number,
    take: number,
    order: 'asc' | 'desc',
  ): Promise<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null }>> {
    const direction = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const whereSql = clauses.length > 0 ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}` : Prisma.empty;

    return tx.$queryRaw<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null }>>`
      SELECT "id", "threadId", "note", "at", "createdAt", "completedAt", "cancelledAt"
      FROM "Reminder"
      ${whereSql}
      ORDER BY COALESCE("completedAt", "cancelledAt", "createdAt") ${direction}, "createdAt" ${direction}
      OFFSET ${skip}
      LIMIT ${take}
    `;
  }

  private async getRunsCount(ids: string[]): Promise<Record<string, number>> {
    if (!ids || ids.length === 0) return {};
    const grouped = await this.prisma.run.groupBy({
      by: ['threadId'],
      where: { threadId: { in: ids } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const row of grouped) out[row.threadId] = row._count._all;
    return out;
  }
  private async resolveAgentDescriptors(threadIds: string[]): Promise<Record<string, AgentDescriptor>> {
    const fallback = '(unknown agent)';
    const descriptors: Record<string, AgentDescriptor> = Object.fromEntries(
      threadIds.map((id) => [id, { title: fallback } as AgentDescriptor]),
    );
    if (!threadIds || threadIds.length === 0) return descriptors;

    const graph = await this.graphs.get('main');
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return descriptors;

    const computeDescriptor = (node: PersistedGraphNode): AgentDescriptor => {
      const config = (node.config as Record<string, unknown> | undefined) ?? undefined;
      const rawName = typeof config?.['name'] === 'string' ? (config['name'] as string) : undefined;
      const name = rawName?.trim();
      const rawRole = typeof config?.['role'] === 'string' ? (config['role'] as string) : undefined;
      const role = rawRole?.trim();

      const rawTitle = typeof config?.['title'] === 'string' ? (config['title'] as string) : undefined;
      const configTitle = rawTitle?.trim();
      const templateMeta = this.templateRegistry.getMeta(node.template);
      const templateTitleRaw = templateMeta?.title ?? node.template;
      const templateTitle = typeof templateTitleRaw === 'string' ? templateTitleRaw.trim() : undefined;
      const profileFallback =
        name && name.length > 0 && role && role.length > 0
          ? `${name} (${role})`
          : name && name.length > 0
            ? name
            : role && role.length > 0
              ? role
              : undefined;
      const resolvedTitle =
        configTitle && configTitle.length > 0
          ? configTitle
          : profileFallback && profileFallback.length > 0
            ? profileFallback
            : templateTitle && templateTitle.length > 0
              ? templateTitle
              : fallback;

      const descriptor: AgentDescriptor = { title: resolvedTitle };
      if (name && name.length > 0) {
        descriptor.name = name;
      }
      if (role && role.length > 0) {
        descriptor.role = role;
      }
      return descriptor;
    };

    const agentNodes = graph.nodes.filter((node) => {
      const meta = this.templateRegistry.getMeta(node.template);
      if (meta) return meta.kind === 'agent';
      return node.template === 'agent';
    });
    if (agentNodes.length === 0) return descriptors;

    const nodeById = new Map<string, PersistedGraphNode>(agentNodes.map((node) => [node.id, node]));

    const threads = await this.prisma.thread.findMany({
      where: { id: { in: threadIds } },
      select: { id: true, assignedAgentNodeId: true },
    });

    for (const thread of threads) {
      const assignedId = typeof thread.assignedAgentNodeId === 'string' ? thread.assignedAgentNodeId.trim() : '';
      if (!assignedId) continue;
      const node = nodeById.get(assignedId);
      if (!node) continue;
      descriptors[thread.id] = computeDescriptor(node);
    }

    return descriptors;
  }

  private getRunEventDelegate(tx: Prisma.TransactionClient): RunEventDelegate | undefined {
    const candidate = (tx as { runEvent?: RunEventDelegate }).runEvent;
    if (!candidate || typeof candidate.findFirst !== 'function') return undefined;
    return candidate;
  }

  private normalizeForPersistence(
    msg: HumanMessage | DeveloperMessage | SystemMessage | AIMessage | ToolCallMessage | ToolCallOutputMessage,
  ): HumanMessage | SystemMessage | AIMessage | ToolCallMessage | ToolCallOutputMessage {
    if (msg instanceof DeveloperMessage) {
      const developer = msg as unknown as DeveloperMessagePlain;
      const coerced = coerceRole(developer.toPlain(), 'system') as ResponseInputItem.Message & { role: 'system' };
      return new SystemMessage(coerced);
    }
    return msg;
  }

  private normalizeToUserMessage(msg: HumanMessage | DeveloperMessage | SystemMessage | AIMessage): HumanMessage {
    const normalized = this.normalizeForPersistence(msg);
    if (normalized instanceof HumanMessage) return normalized;
    if (normalized instanceof SystemMessage) {
      const plain = normalized.toPlain();
      return new HumanMessage({ ...plain, role: 'user' });
    }
    if (normalized instanceof AIMessage) {
      return HumanMessage.fromText(normalized.text);
    }
    if (normalized instanceof ToolCallMessage || normalized instanceof ToolCallOutputMessage) {
      throw new Error('Tool call messages cannot be normalized to user input');
    }
    const neverType: never = normalized;
    throw new Error(`Unsupported message for user normalization: ${neverType}`);
  }

  /**
   * Strict derivation of kind/text from typed message instances.
   */
  private deriveKindTextTyped(
    msg: HumanMessage | SystemMessage | AIMessage | ToolCallMessage | ToolCallOutputMessage,
  ): { kind: MessageKind; text: string | null } {
    if (msg instanceof HumanMessage) return { kind: 'user' as MessageKind, text: msg.text };
    if (msg instanceof SystemMessage) return { kind: 'system' as MessageKind, text: msg.text };
    if (msg instanceof AIMessage) return { kind: 'assistant' as MessageKind, text: msg.text };
    if (msg instanceof ToolCallMessage) return { kind: 'tool' as MessageKind, text: `call ${msg.name}(${msg.args})` };
    if (msg instanceof ToolCallOutputMessage) return { kind: 'tool' as MessageKind, text: msg.text };
    // Unreachable via typing; keep fallback for safety
    return { kind: 'user' as MessageKind, text: null };
  }

  // Summary initialization is upstream-only; no sanitization/truncation here.
}
