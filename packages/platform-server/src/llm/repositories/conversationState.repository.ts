import type { InputJsonValue, JsonValue } from '../services/messages.serialization';
import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

export type ConversationStateRead = {
  threadId: string;
  nodeId: string;
  state: JsonValue;
};

export type ConversationStateUpsert = {
  threadId: string;
  nodeId: string;
  state: InputJsonValue;
};

@Injectable()
export class ConversationStateRepository {
  private readonly logger = new Logger(ConversationStateRepository.name);

  constructor(private prisma: PrismaClient) {}

  async get(threadId: string, nodeId: string): Promise<ConversationStateRead | null> {
    const found = await this.prisma.conversationState.findUnique({ where: { threadId_nodeId: { threadId, nodeId } } });
    if (!found) return null;
    return { threadId: found.threadId, nodeId: found.nodeId, state: found.state };
  }

  async upsert(rec: ConversationStateUpsert): Promise<void> {
    if (containsNullCharacter(rec.state)) {
      this.logger.warn('ConversationStateRepository.upsert received state containing NUL characters', {
        threadId: rec.threadId,
        nodeId: rec.nodeId,
        stack: new Error('conversation_state_nul').stack,
      });
    }
    await this.prisma.conversationState.upsert({
      where: { threadId_nodeId: { threadId: rec.threadId, nodeId: rec.nodeId } },
      create: { threadId: rec.threadId, nodeId: rec.nodeId, state: rec.state },
      update: { state: rec.state },
    });
  }
}

function containsNullCharacter(value: InputJsonValue): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) {
    return value.some((entry) => containsNullCharacter(entry as InputJsonValue));
  }
  if (value instanceof Date) return false;
  if (typeof value === 'object') {
    return Object.values(value as Record<string, InputJsonValue>).some((entry) => containsNullCharacter(entry));
  }
  return false;
}
