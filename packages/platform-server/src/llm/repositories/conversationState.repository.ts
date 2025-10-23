import type { PrismaClient } from '@prisma/client';

export type ConversationStateRecord = {
  threadId: string;
  nodeId: string;
  state: unknown;
};

@Injectable()
export class ConversationStateRepository {
  constructor(private prisma: PrismaClient) {}

  async get(threadId: string, nodeId: string): Promise<ConversationStateRecord | null> {
    const found = await this.prisma.conversationState.findUnique({ where: { threadId_nodeId: { threadId, nodeId } } });
    if (!found) return null;
    return { threadId: found.threadId, nodeId: found.nodeId, state: found.state };
  }

  async upsert(rec: ConversationStateRecord): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { threadId_nodeId: { threadId: rec.threadId, nodeId: rec.nodeId } },
      create: { threadId: rec.threadId, nodeId: rec.nodeId, state: rec.state },
      update: { state: rec.state },
    });
  }
}
import { Injectable } from '@nestjs/common';
