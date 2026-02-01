import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { registerPostgresSanitizerMiddleware } from '../../src/common/sanitize/postgres-text.sanitize';
import { ConversationStateRepository } from '../../src/llm/repositories/conversationState.repository';

describe('Prisma write sanitizer middleware', () => {
  it('sanitizes ConversationState.upsert payloads before persistence', async () => {
    const prisma = new PrismaClientStub();
    const sanitized = registerPostgresSanitizerMiddleware(prisma as unknown as PrismaClient);
    const repository = new ConversationStateRepository(sanitized);

    await repository.upsert({
      threadId: 'thread-1',
      nodeId: 'node-1',
      state: {
        summary: 'bad\u0000value',
        nested: [{ text: 'chunk\u0002data' }],
      },
    });

    const recorded = prisma.lastConversationStateUpsertArgs;
    expect(recorded).toBeDefined();
    expect(recorded?.create?.state).toEqual({
      summary: 'bad\uFFFDvalue',
      nested: [{ text: 'chunk\uFFFDdata' }],
    });
    expect(recorded?.update?.state).toEqual({
      summary: 'bad\uFFFDvalue',
      nested: [{ text: 'chunk\uFFFDdata' }],
    });
  });

  it('sanitizes upsert selectors so sanitized rows can be matched', async () => {
    const prisma = new PrismaClientStub();
    const sanitized = registerPostgresSanitizerMiddleware(prisma as unknown as PrismaClient);
    const repository = new ConversationStateRepository(sanitized);

    await repository.upsert({
      threadId: 'thread-\u0000',
      nodeId: 'node-\u0000',
      state: { summary: 'value\u0000' },
    });

    expect(prisma.lastConversationStateUpsertArgs?.where).toEqual({
      threadId_nodeId: {
        threadId: 'thread-\uFFFD',
        nodeId: 'node-\uFFFD',
      },
    });
  });

  it('sanitizes where filters on update operations so sanitized rows match', async () => {
    const prisma = new PrismaClientStub();
    const sanitized = registerPostgresSanitizerMiddleware(prisma as unknown as PrismaClient);

    await sanitized.conversationState.update({
      where: {
        threadId_nodeId: {
          threadId: 'thread-\u0000',
          nodeId: 'node-\u0000',
        },
      },
      data: {
        state: { summary: 'value\u0000' },
      },
    });

    expect(prisma.lastConversationStateUpdateArgs?.where).toEqual({
      threadId_nodeId: {
        threadId: 'thread-\uFFFD',
        nodeId: 'node-\uFFFD',
      },
    });
    expect(prisma.lastConversationStateUpdateArgs?.data).toEqual({
      state: { summary: 'value\uFFFD' },
    });
  });
});

class PrismaClientStub {
  private handler?: QueryInterceptor;
  public lastConversationStateUpsertArgs?: Prisma.ConversationStateUpsertArgs;
  public lastConversationStateUpdateArgs?: Prisma.ConversationStateUpdateArgs;

  public readonly conversationState: PrismaClient['conversationState'];

  constructor() {
    this.conversationState = {
      upsert: (args: Prisma.ConversationStateUpsertArgs) =>
        this.execute('upsert', 'ConversationState', args),
      update: (args: Prisma.ConversationStateUpdateArgs) =>
        this.execute('update', 'ConversationState', args),
    } as unknown as PrismaClient['conversationState'];
  }

  $extends(extension: PrismaExtension): PrismaClientStub {
    this.handler = extension.query?.$allModels?.$allOperations;
    return this;
  }

  private execute(action: Prisma.PrismaAction, model: string, args: unknown): Promise<unknown> {
    if (!this.handler) {
      return this.record(action, model, args);
    }
    return this.handler({
      model,
      operation: action,
      args,
      query: (nextArgs) => this.record(action, model, nextArgs),
    });
  }

  private async record(action: Prisma.PrismaAction, model: string, args: unknown): Promise<unknown> {
    if (model === 'ConversationState' && action === 'upsert') {
      this.lastConversationStateUpsertArgs = args as Prisma.ConversationStateUpsertArgs;
    }
    if (model === 'ConversationState' && action === 'update') {
      this.lastConversationStateUpdateArgs = args as Prisma.ConversationStateUpdateArgs;
    }
    return args;
  }
}

type QueryInterceptor = (input: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

type PrismaExtension = {
  query?: {
    $allModels?: {
      $allOperations?: QueryInterceptor;
    };
  };
};
