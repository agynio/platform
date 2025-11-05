import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../core/services/prisma.service';
import { AIMessage, HumanMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { toPrismaJsonValue } from '../llm/services/messages.serialization';
import type { Prisma, RunStatus, RunMessageType, MessageKind, PrismaClient } from '@prisma/client';

export type RunStartResult = { runId: string };

@Injectable()
export class AgentsPersistenceService {
  constructor(@Inject(PrismaService) private prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async ensureThreadByAlias(alias: string): Promise<string> {
    // Compatibility helper: ensure a thread by alias only.
    // Does NOT derive parentId from alias. Parent linkage must be explicit via ensureThread.
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    const created = await this.prisma.thread.create({ data: { alias } });
    return created.id;
  }

  /**
   * Ensure a thread exists with the given alias. When parentThreadId is provided
   * and the thread is newly created, set Thread.parentId to it.
   */
  async ensureThread(alias: string, parentThreadId?: string | null): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    let parentId: string | undefined = undefined;
    if (parentThreadId) {
      // Resolve provided parent alias to DB id.
      parentId = await this.ensureThreadByAlias(parentThreadId);
    }
    const created = await this.prisma.thread.create({ data: { alias, parentId } });
    return created.id;
  }

  /**
   * Begin a run and persist input messages. Accepts strictly typed message instances.
   * Supports optional explicit parent thread linkage.
   */
  async beginRun(
    threadAlias: string,
    inputMessages: Array<HumanMessage | SystemMessage | AIMessage>,
    parentThreadId?: string | null,
  ): Promise<RunStartResult> {
    const threadId = await (parentThreadId
      ? this.ensureThread(threadAlias, parentThreadId)
      : this.ensureThreadByAlias(threadAlias));
    const { runId } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.run.create({ data: { threadId, status: 'running' as RunStatus } });
      await Promise.all(
        inputMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
        }),
      );
      return { runId: run.id };
    });
    return { runId };
  }

  /**
   * Persist injected messages. Only SystemMessage injections are supported.
   */
  async recordInjected(runId: string, injectedMessages: SystemMessage[]): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await Promise.all(
        injectedMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
        }),
      );
    });
  }

  /**
   * Complete a run and persist output messages. Accepts strictly typed output message instances.
   */
  async completeRun(
    runId: string,
    status: RunStatus,
    outputMessages: Array<AIMessage | ToolCallMessage | ToolCallOutputMessage>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await Promise.all(
        outputMessages.map(async (msg) => {
          const { kind, text } = this.deriveKindTextTyped(msg);
          const source = toPrismaJsonValue(msg.toPlain());
          const created = await tx.message.create({ data: { kind, text, source } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: 'output' as RunMessageType } });
        }),
      );
      await tx.run.update({ where: { id: runId }, data: { status } });
    });
  }

  async listThreads(): Promise<Array<{ id: string; alias: string; createdAt: Date; parentId?: string | null }>> {
    // Include parentId for clients that need thread hierarchy; preserves compatibility
    return this.prisma.thread.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, createdAt: true, parentId: true }, take: 100 });
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
