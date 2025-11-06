import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../core/services/prisma.service';
import { AIMessage, HumanMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import type { Prisma, RunStatus, RunMessageType, MessageKind, PrismaClient, ThreadStatus } from '@prisma/client';
import { LoggerService } from '../core/services/logger.service';
import { ThreadsMetricsService, type ThreadMetrics } from './threads.metrics.service';
import { GraphEventsPublisher } from '../gateway/graph.events.publisher';

export type RunStartResult = { runId: string };

@Injectable()
export class AgentsPersistenceService {
  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(GraphEventsPublisher) private readonly events: GraphEventsPublisher,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  /**
   * Resolve a UUID threadId for a globally-unique alias. Alias is only used at ingress.
   */
  async getOrCreateThreadByAlias(_source: string, alias: string): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    const created = await this.prisma.thread.create({ data: { alias } });
    this.events.emitThreadCreated({ id: created.id, alias: created.alias, summary: created.summary ?? null, status: created.status, createdAt: created.createdAt, parentId: created.parentId ?? null });
    return created.id;
  }

  /**
   * Resolve a child UUID threadId for a subthread alias under a parent threadId.
   * Alias must be globally unique; we compose alias using parent to satisfy uniqueness.
   */
  async getOrCreateSubthreadByAlias(source: string, alias: string, parentThreadId: string): Promise<string> {
    const composed = `${source}:${parentThreadId}:${alias}`;
    const existing = await this.prisma.thread.findUnique({ where: { alias: composed } });
    if (existing) return existing.id;
    const created = await this.prisma.thread.create({ data: { alias: composed, parentId: parentThreadId } });
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
    const { runId, createdMessages } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.run.create({ data: { threadId, status: 'running' as RunStatus } });
      const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
      await Promise.all(
        inputMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
          createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
        }),
      );
      return { runId: run.id, createdMessages };
    });
    this.events.emitRunStatusChanged(threadId, { id: runId, status: 'running' as RunStatus, createdAt: new Date(), updatedAt: new Date() });
    for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
    // Consider scheduling ancestors; keeping current semantics per review note
    this.events.scheduleThreadMetrics(threadId);
    return { runId };
  }

  /**
   * Persist injected messages. Only SystemMessage injections are supported.
   */
  async recordInjected(runId: string, injectedMessages: SystemMessage[]): Promise<void> {
    const createdMessages: Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }> = [];
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await Promise.all(
        injectedMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
          createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
        }),
      );
    });
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { threadId: true } });
    const threadId = run?.threadId;
    if (threadId) for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
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
    const run = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await Promise.all(
        outputMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'output' as RunMessageType } });
          createdMessages.push({ id: created.id, kind, text, source: created.source as Prisma.JsonValue, createdAt: created.createdAt });
        }),
      );
      const updated = await tx.run.update({ where: { id: runId }, data: { status } });
      return updated;
    });
    const threadId = run.threadId;
    for (const m of createdMessages) this.events.emitMessageCreated(threadId, { id: m.id, kind: m.kind, text: m.text, source: m.source as Prisma.JsonValue, createdAt: m.createdAt, runId });
    this.events.emitRunStatusChanged(threadId, { id: runId, status, createdAt: run.createdAt, updatedAt: run.updatedAt });
    this.events.scheduleThreadMetrics(threadId);
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

  async updateThread(threadId: string, data: { summary?: string | null; status?: ThreadStatus }): Promise<void> {
    const patch: Prisma.ThreadUpdateInput = {};
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.status !== undefined) patch.status = data.status;
    const updated = await this.prisma.thread.update({ where: { id: threadId }, data: patch });
    this.events.emitThreadUpdated({ id: updated.id, alias: updated.alias, summary: updated.summary ?? null, status: updated.status, createdAt: updated.createdAt, parentId: updated.parentId ?? null });
  }

  /** Aggregate subtree metrics for provided root IDs. */
  async getThreadsMetrics(ids: string[]): Promise<Record<string, ThreadMetrics>> {
    return this.metrics.getThreadsMetrics(ids);
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
    const msgIds = links.map((l) => l.messageId);
    const msgs = await this.prisma.message.findMany({ where: { id: { in: msgIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, text: true, source: true, createdAt: true } });
    return msgs;
  }

  async listReminders(
    filter: 'active' | 'completed' | 'all' = 'active',
    take: number = 100,
  ): Promise<Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null }>> {
    const where =
      filter === 'active'
        ? { completedAt: null }
        : filter === 'completed'
        ? { NOT: { completedAt: null } }
        : undefined;
    return this.prisma.reminder.findMany({
      where,
      orderBy: { at: 'desc' },
      select: { id: true, threadId: true, note: true, at: true, createdAt: true, completedAt: true },
      take,
    });
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
}
