import {
  AIMessage,
  DeveloperMessage,
  HumanMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MessageKind, Prisma, PrismaClient, RunMessageType, RunStatus, ThreadStatus } from '@prisma/client';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import { PrismaService } from '../core/services/prisma.service';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import { isAgentTemplate } from './agent-node.utils';
import { GraphRepository } from '../graph/graph.repository';
import type { PersistedGraphNode } from '../shared/types/graph.types';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import { coerceRole } from '../llm/services/messages.normalization';
import { ChannelDescriptorSchema, type ChannelDescriptor, type ThreadOutboxSource } from '../messaging/types';
import { RunEventsService } from '../events/run-events.service';
import { EventsBusService } from '../events/events-bus.service';
import { CallAgentLinkingService } from './call-agent-linking.service';
import { ThreadsMetricsService, type ThreadMetrics } from './threads.metrics.service';

export type RunStartResult = { runId: string };

type RunEventDelegate = Prisma.TransactionClient['runEvent'];

type DeveloperMessagePlain = {
  text: string;
  toPlain(): ResponseInputItem.Message;
};

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

  /**
   * Resolve a UUID threadId for a globally-unique alias. Alias is only used at ingress.
   */
  async getOrCreateThreadByAlias(
    _source: string,
    alias: string,
    summary: string,
    options?: { channelNodeId?: string },
  ): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias }, select: { id: true } });
    if (existing) return existing.id;
    const sanitized = this.sanitizeSummary(summary);
    const created = await this.prisma.thread.create({
      data: {
        alias,
        summary: sanitized,
        ...(options?.channelNodeId ? { channelNodeId: options.channelNodeId } : {}),
      },
    });
    this.eventsBus.emitThreadCreated({
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
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
    const updated = await this.prisma.thread.update({ where: { id: threadId }, data: { channel: channelJson } });
    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
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
    const sanitized = this.sanitizeSummary(summary);
    const created = await this.prisma.thread.create({ data: { alias: composed, parentId: parentThreadId, summary: sanitized } });
    this.eventsBus.emitThreadCreated({
      id: created.id,
      alias: created.alias,
      summary: created.summary ?? null,
      status: created.status,
      createdAt: created.createdAt,
      parentId: created.parentId ?? null,
      channelNodeId: created.channelNodeId ?? null,
      assignedAgentNodeId: created.assignedAgentNodeId ?? null,
    });
    this.eventsBus.emitThreadMetricsAncestors({ threadId: created.id });
    return created.id;
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
      },
    });
    if (!updated) return;
    this.eventsBus.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
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
    const { runId, createdMessages, eventIds, patchedEventIds } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Begin run and persist messages
      const run = await tx.run.create({ data: { threadId, status: 'running' as RunStatus } });
      const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
      const eventIds: string[] = [];
      const patchedEventIds: string[] = [];
      await Promise.all(
        inputMessages.map(async (msg) => {
          const normalized = this.normalizeForPersistence(msg);
          if (!this.isInputMessage(normalized)) {
            throw new Error('unsupported_input_message_type');
          }
          const { text } = this.deriveKindTextTyped(normalized);
          const source = this.toUserMessageSource(normalized);
          const created = await tx.message.create({ data: { kind: 'user' as MessageKind, text, source } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
          const event = await this.runEvents.recordInvocationMessage({
            tx,
            runId: run.id,
            threadId,
            messageId: created.id,
            role: 'user' as MessageKind,
            ts: created.createdAt,
            metadata: { messageType: 'input' },
          });
          eventIds.push(event.id);
          createdMessages.push({ id: created.id, kind: 'user' as MessageKind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
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
      run: { id: runId, status: 'running' as RunStatus, createdAt: new Date(), updatedAt: new Date() },
    });
    for (const m of createdMessages) {
      this.eventsBus.emitMessageCreated({
        threadId,
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
        const normalized = this.normalizeForPersistence(msg);
        if (!this.isInputMessage(normalized)) {
          throw new Error('unsupported_injected_message_type');
        }
        const { text } = this.deriveKindTextTyped(normalized);
        const source = this.toUserMessageSource(normalized);
        const created = await tx.message.create({ data: { kind: 'user' as MessageKind, text, source } });
        await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
        const event = await this.runEvents.recordInvocationMessage({
          tx,
          runId,
          threadId: resolvedThreadId,
          messageId: created.id,
          role: 'user' as MessageKind,
          ts: created.createdAt,
          metadata: { messageType: 'injected' },
        });
        eventIds.push(event.id);
        createdMessages.push({ id: created.id, kind: 'user' as MessageKind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
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

    for (const m of createdMessages) {
      this.eventsBus.emitMessageCreated({
        threadId,
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

    await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));

    return { messageIds: createdMessages.map((m) => m.id) };
  }

  async recordOutboxMessage(params: {
    threadId: string;
    text: string;
    role: 'assistant' | 'user';
    source: ThreadOutboxSource;
    runId?: string | null;
  }): Promise<{ messageId: string }> {
    const { threadId, role, source } = params;
    const textValue = params.text?.trim() ?? '';
    if (!textValue) throw new Error('outbox_empty_message');
    const runId = params.runId ?? null;
    const sourceJson = toPrismaJsonValue({ role, text: textValue, origin: 'thread_outbox', source });

    const { messageId, createdAt, eventId } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.message.create({ data: { kind: role as MessageKind, text: textValue, source: sourceJson } });
      if (runId) {
        await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'output' as RunMessageType } });
      }
      let recordedEventId: string | null = null;
      if (runId) {
        const event = await this.runEvents.recordInvocationMessage({
          tx,
          runId,
          threadId,
          messageId: created.id,
          role: role as MessageKind,
          ts: created.createdAt,
          metadata: { messageType: 'output', outboxSource: source },
        });
        recordedEventId = event.id;
      }
      if (runId) {
        await this.callAgentLinking.onChildRunMessage({ tx, runId, latestMessageId: created.id });
      }
      return { messageId: created.id, createdAt: created.createdAt, eventId: recordedEventId };
    });

    this.eventsBus.emitMessageCreated({
      threadId,
      message: { id: messageId, kind: role as MessageKind, text: textValue, source: sourceJson, createdAt, runId: runId ?? undefined },
    });
    this.eventsBus.emitThreadMetrics({ threadId });
    if (eventId) await this.eventsBus.publishEvent(eventId, 'append');
    return { messageId };
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
      await Promise.all(
        outputMessages.map(async (msg) => {
          const normalized = this.normalizeForPersistence(msg);
          const { kind, text } = this.deriveKindTextTyped(normalized);
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
        }),
      );
      const updated = await tx.run.update({ where: { id: runId }, data: { status } });
      const linkedEventId = await this.callAgentLinking.onChildRunCompleted({ tx, runId, status });
      if (linkedEventId) patchedEventIds.push(linkedEventId);
      return updated;
    });
    const threadId = run.threadId;
    for (const m of createdMessages) {
      this.eventsBus.emitMessageCreated({
        threadId,
        message: { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId },
      });
    }
    this.eventsBus.emitRunStatusChanged({ threadId, run: { id: runId, status, createdAt: run.createdAt, updatedAt: run.updatedAt } });
    this.eventsBus.emitThreadMetrics({ threadId });
    await Promise.all(eventIds.map((id) => this.eventsBus.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.eventsBus.publishEvent(id, 'update')));
  }

  async listThreads(opts?: { rootsOnly?: boolean; status?: 'open' | 'closed' | 'all'; limit?: number }): Promise<Array<{ id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }>> {
    const rootsOnly = opts?.rootsOnly ?? false;
    const status = opts?.status ?? 'all';
    const limit = opts?.limit ?? 100;
    const where: Prisma.ThreadWhereInput = {};
    if (rootsOnly) where.parentId = null;
    if (status !== 'all') where.status = status as ThreadStatus;
    return this.prisma.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true },
      take: limit,
    });
  }

  async getThreadById(
    threadId: string,
    opts?: { includeMetrics?: boolean; includeAgentTitles?: boolean },
  ): Promise<
    | ({
        id: string;
        alias: string;
        summary: string | null;
        status: ThreadStatus;
        createdAt: Date;
        parentId: string | null;
        assignedAgentNodeId: string | null;
        metrics?: ThreadMetrics;
        agentTitle?: string;
      })
    | null
  > {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        alias: true,
        summary: true,
        status: true,
        createdAt: true,
        parentId: true,
        assignedAgentNodeId: true,
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
      metrics?: ThreadMetrics;
      agentTitle?: string;
    } = {
      ...thread,
      parentId: thread.parentId ?? null,
      assignedAgentNodeId: thread.assignedAgentNodeId ?? null,
    };

    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const fallbackTitle = '(unknown agent)';

    if (includeMetrics) {
      const metrics = await this.getThreadsMetrics([thread.id]);
      result.metrics = metrics[thread.id] ?? defaultMetrics;
    }

    if (includeAgentTitles) {
      const titles = await this.getThreadsAgentTitles([thread.id]);
      result.agentTitle = titles[thread.id] ?? fallbackTitle;
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

  async listChildren(parentId: string, status: 'open' | 'closed' | 'all' = 'all'): Promise<Array<{ id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }>> {
    const where: Prisma.ThreadWhereInput = { parentId };
    if (status !== 'all') where.status = status as ThreadStatus;
    return this.prisma.thread.findMany({ where, orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, summary: true, status: true, createdAt: true, parentId: true } });
  }

  async updateThread(
    threadId: string,
    data: { summary?: string | null; status?: ThreadStatus },
  ): Promise<{ previousStatus: ThreadStatus; status: ThreadStatus }> {
    const patch: Prisma.ThreadUpdateInput = {};
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.status !== undefined) patch.status = data.status;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.thread.findUnique({ where: { id: threadId }, select: { status: true } });
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

  async getThreadsAgentTitles(ids: string[]): Promise<Record<string, string>> {
    if (!ids || ids.length === 0) return {};
    try {
      const threads = await this.prisma.thread.findMany({
        where: { id: { in: ids } },
        select: { id: true, assignedAgentNodeId: true },
      });
      const assignedNodeIds = Array.from(
        new Set(
          threads
            .map((thread) => thread.assignedAgentNodeId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
        ),
      );
      const assignedTitles = await this.resolveAgentNodeTitles(assignedNodeIds);
      const titles: Record<string, string> = {};
      for (const thread of threads) {
        const assignedId = thread.assignedAgentNodeId;
        if (!assignedId) continue;
        const title = assignedTitles[assignedId];
        if (title) titles[thread.id] = title;
      }

      const unresolvedIds = ids.filter((id) => !titles[id]);
      if (unresolvedIds.length === 0) return titles;

      const fallbackTitles = await this.resolveAgentTitles(unresolvedIds);
      return { ...titles, ...fallbackTitles };
    } catch (err) {
      this.logger.error(
        `AgentsPersistenceService failed to resolve agent titles ${this.format({ error: this.errorInfo(err) })}`,
      );
      const fallback = '(unknown agent)';
      return Object.fromEntries(ids.map((id) => [id, fallback]));
    }
  }

  async getThreadAgentTitle(threadId: string): Promise<string | null> {
    const titles = await this.getThreadsAgentTitles([threadId]);
    return titles[threadId] ?? null;
  }

  async getThreadAgentNodeId(threadId: string): Promise<string | null> {
    try {
      const graph = await this.graphs.get('main');
      if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return null;

      const agentNodeIds = graph.nodes
        .filter((node) => isAgentTemplate(node.template, this.templateRegistry))
        .map((node) => node.id);

      if (agentNodeIds.length === 0) return null;

      const state = await this.prisma.conversationState.findFirst({
        where: { threadId, nodeId: { in: agentNodeIds } },
        select: { nodeId: true },
        orderBy: { updatedAt: 'desc' },
      });

      return state?.nodeId ?? null;
    } catch (error) {
      this.logger.error(
        `AgentsPersistenceService failed to resolve agent node id${this.format({
          threadId,
          error: this.errorInfo(error),
        })}`,
      );
      return null;
    }
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

  async getRunById(runId: string): Promise<{ id: string; threadId: string; status: RunStatus } | null> {
    return this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, threadId: true, status: true },
    });
  }

  async listRunMessages(runId: string, type: RunMessageType): Promise<Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }>> {
    const links = await this.prisma.runMessage.findMany({ where: { runId, type }, select: { messageId: true } });
    if (links.length === 0) return [];
    const msgIds = links.map(({ messageId }) => messageId);
    const msgs = await this.prisma.message.findMany({ where: { id: { in: msgIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, text: true, source: true, createdAt: true } });
    return msgs;
  }

  async listReminders(
    filter: 'active' | 'completed' | 'all' = 'active',
    take: number = 100,
    threadId?: string,
  ): Promise<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null }>> {
    const limit = Number.isFinite(take) ? Math.min(1000, Math.max(1, Math.trunc(take))) : 100;
    const where: Prisma.ReminderWhereInput = {};
    if (filter === 'active') {
      where.completedAt = null;
      where.cancelledAt = null;
    } else if (filter === 'completed') {
      where.NOT = { completedAt: null };
    }
    if (threadId) where.threadId = threadId;

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

  private async resolveAgentNodeTitles(nodeIds: string[]): Promise<Record<string, string>> {
    if (!nodeIds || nodeIds.length === 0) return {};
    const graph = await this.graphs.get('main');
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return {};

    const agentNodes = graph.nodes.filter((node) => isAgentTemplate(node.template, this.templateRegistry));
    if (agentNodes.length === 0) return {};

    const nodeById = new Map<string, PersistedGraphNode>(agentNodes.map((node) => [node.id, node]));
    const fallback = '(unknown agent)';
    const titles: Record<string, string> = {};

    for (const nodeId of new Set(nodeIds)) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const config = (node.config as Record<string, unknown> | undefined) ?? undefined;
      const rawTitle = typeof config?.['title'] === 'string' ? (config['title'] as string) : undefined;
      const configTitle = rawTitle?.trim();
      const templateMeta = this.templateRegistry.getMeta(node.template);
      const templateTitle = templateMeta?.title ?? node.template;
      const resolved = configTitle && configTitle.length > 0
        ? configTitle
        : templateTitle && templateTitle.trim().length > 0
          ? templateTitle
          : fallback;
      titles[nodeId] = resolved;
    }

    return titles;
  }

  private async resolveAgentTitles(threadIds: string[]): Promise<Record<string, string>> {
    const fallback = '(unknown agent)';
    const empty = Object.fromEntries(threadIds.map((id) => [id, fallback]));
    const graph = await this.graphs.get('main');
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return empty;

    const agentNodes = graph.nodes.filter((node) => isAgentTemplate(node.template, this.templateRegistry));
    if (agentNodes.length === 0) return empty;

    const nodeById = new Map<string, PersistedGraphNode>(agentNodes.map((node) => [node.id, node]));
    const agentIds = agentNodes.map((node) => node.id);
    if (agentIds.length === 0) return empty;

    const states = await this.prisma.conversationState.findMany({
      where: { threadId: { in: threadIds }, nodeId: { in: agentIds } },
      orderBy: { updatedAt: 'desc' },
    });

    const titles: Record<string, string> = {};
    const seen = new Set<string>();
    for (const state of states) {
      if (seen.has(state.threadId)) continue;
      const node = nodeById.get(state.nodeId);
      const config = (node?.config as Record<string, unknown> | undefined) ?? undefined;
      const rawTitle = typeof config?.['title'] === 'string' ? (config['title'] as string) : undefined;
      const configTitle = rawTitle?.trim();
      const templateName = node ? this.templateRegistry.getMeta(node.template)?.title ?? node.template : undefined;
      const resolved = configTitle && configTitle.length > 0 ? configTitle : templateName && templateName.length > 0 ? templateName : fallback;
      titles[state.threadId] = resolved;
      seen.add(state.threadId);
    }

    for (const id of threadIds) if (!titles[id]) titles[id] = fallback;
    return titles;
  }
  private getRunEventDelegate(tx: Prisma.TransactionClient): RunEventDelegate | undefined {
    const candidate = (tx as { runEvent?: RunEventDelegate }).runEvent;
    if (!candidate || typeof candidate.findFirst !== 'function') return undefined;
    return candidate;
  }

  private isInputMessage(
    msg: HumanMessage | SystemMessage | AIMessage | ToolCallMessage | ToolCallOutputMessage,
  ): msg is HumanMessage | SystemMessage | AIMessage {
    return msg instanceof HumanMessage || msg instanceof SystemMessage || msg instanceof AIMessage;
  }

  private toUserMessageSource(msg: HumanMessage | SystemMessage | AIMessage): Prisma.InputJsonValue {
    if (msg instanceof HumanMessage) {
      return toPrismaJsonValue(msg.toPlain());
    }
    if (msg instanceof SystemMessage) {
      const plain = msg.toPlain();
      return toPrismaJsonValue({ ...plain, role: 'user' as const });
    }
    const userPlain = HumanMessage.fromText(msg.text).toPlain();
    return toPrismaJsonValue(userPlain);
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
