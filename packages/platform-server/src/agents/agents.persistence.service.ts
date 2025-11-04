import { Injectable, Inject } from '@nestjs/common';
import { Prisma, PrismaClient, MessageKind, RunStatus, RunMessageType } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';

export type RunStartResult = { runId: string };

@Injectable()
export class AgentsPersistenceService {
  constructor(@Inject(PrismaService) private prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async ensureThreadByAlias(alias: string): Promise<string> {
    // Return existing thread id if present
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;

    // Determine immediate parent alias by the last "__" occurrence for nested paths
    const sep = alias.lastIndexOf('__');
    if (sep > 0) {
      const parentAlias = alias.slice(0, sep);
      const parentId = await this.ensureThreadByAlias(parentAlias);
      const created = await this.prisma.thread.create({ data: { alias, parentId } });
      return created.id;
    }

    // No parent alias; create a root-level thread
    const created = await this.prisma.thread.create({ data: { alias } });
    return created.id;
  }

  async beginRun(threadAlias: string, inputMessages: Prisma.InputJsonValue[]): Promise<RunStartResult> {
    const threadId = await this.ensureThreadByAlias(threadAlias);
    const { runId } = await this.prisma.$transaction(async (tx) => {
      const run = await tx.run.create({ data: { threadId, status: RunStatus.running } });
      await Promise.all(
        inputMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId: run.id, messageId: created.id, type: RunMessageType.input } });
        }),
      );
      return { runId: run.id };
    });
    return { runId };
  }

  async recordInjected(runId: string, injectedMessages: Prisma.InputJsonValue[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        injectedMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: RunMessageType.injected } });
        }),
      );
    });
  }

  async completeRun(runId: string, status: RunStatus, outputMessages: Prisma.InputJsonValue[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        outputMessages.map(async (msg) => {
          const { kind, text } = this.extractKindText(msg);
          const created = await tx.message.create({ data: { kind, text, source: msg } });
          await tx.runMessage.create({ data: { runId, messageId: created.id, type: RunMessageType.output } });
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

  private extractKindText(msg: Prisma.InputJsonValue): { kind: MessageKind; text: string | null } {
    const obj = (typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : {});
    const roleRaw = typeof (obj as Record<string, unknown>).role === 'string'
      ? ((obj as Record<string, unknown>).role as string)
      : typeof (obj as Record<string, unknown>)["role"] === 'string'
      ? ((obj as Record<string, unknown>)["role"] as string)
      : undefined;
    const role = (roleRaw || ((obj as Record<string, unknown>).type === 'message' && typeof (obj as Record<string, unknown>).role === 'string' ? ((obj as Record<string, unknown>).role as string) : undefined) || 'user');
    let kind: MessageKind;
    switch (role) {
      case 'assistant':
        kind = MessageKind.assistant;
        break;
      case 'system':
        kind = MessageKind.system;
        break;
      case 'tool':
        kind = MessageKind.tool;
        break;
      default:
        kind = MessageKind.user;
    }

    let text: string | null = null;
    if (typeof (obj as Record<string, unknown>).text === 'string') {
      text = ((obj as Record<string, unknown>).text as string);
    } else {
      const rawContent = (obj as Record<string, unknown>).content as unknown;
      if (Array.isArray(rawContent)) {
        const parts: string[] = [];
        for (const c of rawContent) {
          if (c && typeof c === 'object') {
            const co = c as Record<string, unknown>;
            const t = typeof co.text === 'string' ? (co.text as string) : undefined;
            if (t) parts.push(t);
          }
        }
        if (parts.length) text = parts.join('\n');
      }
    }
    return { kind, text };
  }
}
