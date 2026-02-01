import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ConversationStateRepository } from '../src/llm/repositories/conversationState.repository';

describe('ConversationStateRepository', () => {
  it('sanitizes state payloads before calling Prisma', async () => {
    const prisma = new PrismaClientStub();
    const repository = new ConversationStateRepository(prisma as unknown as PrismaClient);

    await repository.upsert({
      threadId: 'thread-1',
      nodeId: 'node-1',
      state: {
        summary: 'bad\u0000value',
        nested: [{ text: 'chunk\u0002data' }],
      },
    });

    expect(prisma.lastUpsert?.create.state).toEqual({
      summary: 'bad\uFFFDvalue',
      nested: [{ text: 'chunk\uFFFDdata' }],
    });
    expect(prisma.lastUpsert?.update.state).toEqual({
      summary: 'bad\uFFFDvalue',
      nested: [{ text: 'chunk\uFFFDdata' }],
    });
  });

  it('passes clean payloads through unchanged', async () => {
    const prisma = new PrismaClientStub();
    const repository = new ConversationStateRepository(prisma as unknown as PrismaClient);

    const cleanState = { summary: 'clean', list: ['a'] };
    await repository.upsert({
      threadId: 'thread-1',
      nodeId: 'node-1',
      state: cleanState,
    });

    expect(prisma.lastUpsert?.create.state).toBe(cleanState);
    expect(prisma.lastUpsert?.update.state).toBe(cleanState);
  });
});

class PrismaClientStub {
  public lastUpsert?: Prisma.ConversationStateUpsertArgs;
  public readonly conversationState: {
    upsert: ReturnType<typeof vi.fn>;
  };

  constructor() {
    this.conversationState = {
      upsert: vi.fn(async (args: Prisma.ConversationStateUpsertArgs) => {
        this.lastUpsert = args;
      }),
    };
  }
}
