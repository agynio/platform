import { AIMessage, HumanMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { Inject, Injectable } from '@nestjs/common';
import type { MessageKind, Prisma, PrismaClient, RunMessageType, RunStatus, ThreadStatus } from '@prisma/client';
import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { GraphEventsPublisher, type GraphEventsPublisherAware } from '../gateway/graph.events.publisher';
import { GraphRepository } from '../graph/graph.repository';
import { TemplateRegistry } from '../graph/templateRegistry';
import type { PersistedGraphNode } from '../graph/types';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import { ChannelDescriptorSchema, type ChannelDescriptor } from '../messaging/types';
import { RunEventsService } from '../events/run-events.service';
import { ThreadsMetricsService, type ThreadMetrics } from './threads.metrics.service';

export type RunStartResult = { runId: string };

type RunEventDelegate = Prisma.TransactionClient['runEvent'];

@Injectable()
export class AgentsPersistenceService implements GraphEventsPublisherAware {
  private events: GraphEventsPublisher;

  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(GraphEventsPublisher) events: GraphEventsPublisher,
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
  ) {
    this.events = events;
  }

  setEventsPublisher(publisher: GraphEventsPublisher): void {
    this.events = publisher;
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private sanitizeSummary(summary: string | null | undefined): string {
    return (summary ?? '').trim().slice(0, 256);
  }

  /**
   * Resolve a UUID threadId for a globally-unique alias. Alias is only used at ingress.
   */
  async getOrCreateThreadByAlias(_source: string, alias: string, summary: string): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    const sanitized = this.sanitizeSummary(summary);
    const created = await this.prisma.thread.create({ data: { alias, summary: sanitized } });
    this.events.emitThreadCreated({ id: created.id, alias: created.alias, summary: created.summary ?? null, status: created.status, createdAt: created.createdAt, parentId: created.parentId ?? null });
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
      this.logger.error('Invalid channel descriptor; skipping persistence', { threadId });
      return;
    }
    const channelJson = toPrismaJsonValue(parsed.data);
    const updated = await this.prisma.thread.update({ where: { id: threadId }, data: { channel: channelJson } });
    this.events.emitThreadUpdated({ id: updated.id, alias: updated.alias, summary: updated.summary ?? null, status: updated.status, createdAt: updated.createdAt, parentId: updated.parentId ?? null });
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
    this.events.emitThreadCreated({ id: created.id, alias: created.alias, summary: created.summary ?? null, status: created.status, createdAt: created.createdAt, parentId: created.parentId ?? null });
    this.events.scheduleThreadAndAncestorsMetrics(created.id);
    return created.id;
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
    inputMessages: Array<HumanMessage | SystemMessage | AIMessage>,
  ): Promise<RunStartResult> {
    const { runId, createdMessages, eventIds, patchedEventIds } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Begin run and persist messages
      const run = await tx.run.create({ data: { threadId, status: 'running' as RunStatus } });
      const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
      const eventIds: string[] = [];
      const patchedEventIds: string[] = [];
      await Promise.all(
        inputMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
          const event = await this.runEvents.recordInvocationMessage({
            tx,
            runId: run.id,
            threadId,
            messageId: created.id,
            role: kind,
            ts: created.createdAt,
            metadata: { messageType: 'input' },
          });
          eventIds.push(event.id);
          createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
        }),
      );
      const runEventDelegate = this.getRunEventDelegate(tx);
      if (runEventDelegate) {
        const parentToolEvent = await runEventDelegate.findFirst({
          where: {
            type: 'tool_execution',
            sourceSpanId: threadId,
            toolExecution: { toolName: { in: ['call_agent', 'call_engineer'] } },
          },
          orderBy: { ts: 'desc' },
        });
        if (parentToolEvent) {
          await this.runEvents.patchEventMetadata({
            tx,
            eventId: parentToolEvent.id,
            patch: {
              childRunId: run.id,
              childRunStatus: 'running',
              childRunLinkEnabled: true,
              childMessageId: createdMessages[0]?.id ?? null,
            },
          });
          patchedEventIds.push(parentToolEvent.id);
        }
      }
      return { runId: run.id, createdMessages, eventIds, patchedEventIds };
    });
    this.events.emitRunStatusChanged(threadId, { id: runId, status: 'running' as RunStatus, createdAt: new Date(), updatedAt: new Date() });
    for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
    this.events.scheduleThreadMetrics(threadId);
    await Promise.all(eventIds.map((id) => this.runEvents.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.runEvents.publishEvent(id, 'update')));
    return { runId };
  }

  /**
   * Persist injected messages. Only SystemMessage injections are supported.
   */
  async recordInjected(runId: string, injectedMessages: SystemMessage[]): Promise<void> {
    const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
    const eventIds: string[] = [];
    const patchedEventIds: string[] = [];
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.run.findUnique({ where: { id: runId }, select: { threadId: true } });
      if (!run) throw new Error(`run_not_found:${runId}`);
      const threadId = run.threadId;
      await Promise.all(
        injectedMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
          const event = await this.runEvents.recordInvocationMessage({
            tx,
            runId,
            threadId,
            messageId: created.id,
            role: kind,
            ts: created.createdAt,
            metadata: { messageType: 'injected' },
          });
          eventIds.push(event.id);
          createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
        }),
      );
      if (createdMessages.length > 0) {
        const inj = await this.runEvents.recordInjection({
          tx,
          runId,
          threadId,
          messageIds: createdMessages.map((m) => m.id),
          ts: createdMessages[0].createdAt,
        });
        eventIds.push(inj.id);
        const runEventDelegate = this.getRunEventDelegate(tx);
        if (runEventDelegate) {
          const parentToolEvent = await runEventDelegate.findFirst({
            where: {
              type: 'tool_execution',
              toolExecution: { toolName: { in: ['call_agent', 'call_engineer'] } },
              metadata: { path: ['childRunId'], equals: runId },
            },
            orderBy: { ts: 'desc' },
          });
          if (parentToolEvent) {
            await this.runEvents.patchEventMetadata({
              tx,
              eventId: parentToolEvent.id,
              patch: {
                childRunId: runId,
                childRunStatus: 'running',
                childRunLinkEnabled: true,
                childMessageId: createdMessages[0]?.id ?? null,
              },
            });
            patchedEventIds.push(parentToolEvent.id);
          }
        }
      }
    });
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { threadId: true } });
    const threadId = run?.threadId;
    if (threadId) for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
    await Promise.all(eventIds.map((id) => this.runEvents.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.runEvents.publishEvent(id, 'update')));
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
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
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
      const runEventDelegate = this.getRunEventDelegate(tx);
      if (runEventDelegate) {
        const parentToolEvent = await runEventDelegate.findFirst({
          where: {
            type: 'tool_execution',
            toolExecution: { toolName: { in: ['call_agent', 'call_engineer'] } },
            metadata: { path: ['childRunId'], equals: runId },
          },
          orderBy: { ts: 'desc' },
        });
        if (parentToolEvent) {
          await this.runEvents.patchEventMetadata({
            tx,
            eventId: parentToolEvent.id,
            patch: {
              childRunStatus: status,
            },
          });
          patchedEventIds.push(parentToolEvent.id);
        }
      }
      return updated;
    });
    const threadId = run.threadId;
    for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
    this.events.emitRunStatusChanged(threadId, { id: runId, status, createdAt: run.createdAt, updatedAt: run.updatedAt });
    this.events.scheduleThreadMetrics(threadId);
    await Promise.all(eventIds.map((id) => this.runEvents.publishEvent(id, 'append')));
    await Promise.all(patchedEventIds.map((id) => this.runEvents.publishEvent(id, 'update')));
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
    this.events.emitThreadUpdated({
      id: updated.id,
      alias: updated.alias,
      summary: updated.summary ?? null,
      status: updated.status,
      createdAt: updated.createdAt,
      parentId: updated.parentId ?? null,
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
      return await this.resolveAgentTitles(ids);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('AgentsPersistenceService failed to resolve agent titles: %s', message);
      const fallback = '(unknown agent)';
      return Object.fromEntries(ids.map((id) => [id, fallback]));
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
  ): Promise<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null }>> {
    const limit = Number.isFinite(take) ? Math.min(1000, Math.max(1, Math.trunc(take))) : 100;
    const where: Prisma.ReminderWhereInput = {};
    if (filter === 'active') where.completedAt = null;
    else if (filter === 'completed') where.NOT = { completedAt: null };
    if (threadId) where.threadId = threadId;

    try {
      return await this.prisma.reminder.findMany({
        where: Object.keys(where).length === 0 ? undefined : where,
        orderBy: { at: 'asc' },
        select: { id: true, threadId: true, note: true, at: true, createdAt: true, completedAt: true },
        take: limit,
      });
    } catch (error) {
      this.logger.error('Failed to list reminders', {
        filter,
        take: limit,
        threadId,
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      });
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

  private async resolveAgentTitles(threadIds: string[]): Promise<Record<string, string>> {
    const fallback = '(unknown agent)';
    const empty = Object.fromEntries(threadIds.map((id) => [id, fallback]));
    const graph = await this.graphs.get('main');
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return empty;

    const agentNodes = graph.nodes.filter((node) => {
      const meta = this.templateRegistry.getMeta(node.template);
      if (meta) return meta.kind === 'agent';
      return node.template === 'agent';
    });
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
