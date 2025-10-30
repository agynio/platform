import type { PrismaClient, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';

export type ConversationStateRead = {
  threadId: string;
  nodeId: string;
  state: Prisma.JsonValue;
};

export type ConversationStateUpsert = {
  threadId: string;
  nodeId: string;
  state: Prisma.InputJsonValue;
};

@Injectable()
export class ConversationStateRepository {
  constructor(private prisma: PrismaClient) {}

  async get(threadId: string, nodeId: string): Promise<ConversationStateRead | null> {
    const found = await this.prisma.conversationState.findUnique({ where: { threadId_nodeId: { threadId, nodeId } } });
    if (!found) return null;
    return { threadId: found.threadId, nodeId: found.nodeId, state: found.state };
  }

  async upsert(rec: ConversationStateUpsert): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { threadId_nodeId: { threadId: rec.threadId, nodeId: rec.nodeId } },
      create: { threadId: rec.threadId, nodeId: rec.nodeId, state: rec.state },
      update: { state: rec.state },
    });
  }
}
