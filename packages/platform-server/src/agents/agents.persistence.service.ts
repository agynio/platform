import { Injectable, Inject } from '@nestjs/common';
import type { Prisma, PrismaClient, MessageKind, RunStatus, RunMessageType } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';

export type RunStartResult = { runId: string };

@Injectable()
export class AgentsPersistenceService {
  constructor(@Inject(PrismaService) private prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  // Ensure a thread exists by alias; create if missing and return id.
  async ensureThreadByAlias(alias: string): Promise<string> {
    const existing = await this.prisma.thread.findUnique({ where: { alias } });
    if (existing) return existing.id;
    const created = await this.prisma.thread.create({ data: { alias } });
    return created.id;
  }

  async beginRun(threadAlias: string, inputMessages: Prisma.InputJsonValue[]): Promise<RunStartResult> {
    const threadId = await this.ensureThreadByAlias(threadAlias);
    const run = await this.prisma.run.create({ data: { threadId, status: 'running' as RunStatus } });
    for (const msg of inputMessages) {
      const { kind, text } = this.extractKindText(msg);
      const created = await this.prisma.message.create({ data: { kind, text, source: msg } });
      await this.prisma.runMessage.create({ data: { runId: run.id, messageId: created.id, type: 'input' as RunMessageType } });
    }
    return { runId: run.id };
  }

  async recordInjected(runId: string, injectedMessages: Prisma.InputJsonValue[]): Promise<void> {
    for (const msg of injectedMessages) {
      const { kind, text } = this.extractKindText(msg);
      const created = await this.prisma.message.create({ data: { kind, text, source: msg } });
      await this.prisma.runMessage.create({ data: { runId, messageId: created.id, type: 'injected' as RunMessageType } });
    }
  }

  async completeRun(runId: string, status: RunStatus, outputMessages: Prisma.InputJsonValue[]): Promise<void> {
    for (const msg of outputMessages) {
      const { kind, text } = this.extractKindText(msg);
      const created = await this.prisma.message.create({ data: { kind, text, source: msg } });
      await this.prisma.runMessage.create({ data: { runId, messageId: created.id, type: 'output' as RunMessageType } });
    }
    await this.prisma.run.update({ where: { id: runId }, data: { status } });
  }

  async listThreads(): Promise<Array<{ id: string; alias: string; createdAt: Date }>> {
    return this.prisma.thread.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, createdAt: true }, take: 100 });
  }

  async listRuns(threadId: string): Promise<Array<{ id: string; status: RunStatus; createdAt: Date; updatedAt: Date }>> {
    return this.prisma.run.findMany({ where: { threadId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, updatedAt: true } });
  }

  async listRunMessages(runId: string, type: RunMessageType): Promise<Array<{ id: string; kind: MessageKind; text: string | null; source: Prisma.JsonValue; createdAt: Date }>> {
    const links = await this.prisma.runMessage.findMany({ where: { runId, type }, select: { messageId: true } });
    if (links.length === 0) return [];
    const msgIds = links.map((l) => l.messageId);
    const msgs = await this.prisma.message.findMany({ where: { id: { in: msgIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, text: true, source: true, createdAt: true } });
    return msgs;
  }

  // Helper: derive message kind and text from raw JSON
  private extractKindText(msg: Prisma.InputJsonValue): { kind: MessageKind; text: string | null } {
    try {
      const o = msg as any;
      const role = (o?.role as string) || (o?.type === 'message' ? o?.role : undefined) || 'user';
      const kind = (role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : role === 'tool' ? 'tool' : 'user') as MessageKind;
      const text = typeof o?.text === 'string' ? (o.text as string) : null;
      return { kind, text };
    } catch {
      return { kind: 'user' as MessageKind, text: null };
    }
  }
}
