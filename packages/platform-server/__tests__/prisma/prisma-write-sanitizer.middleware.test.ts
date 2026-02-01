import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { registerPostgresSanitizerMiddleware } from '../../src/common/sanitize/postgres-text.sanitize';
import { ConversationStateRepository } from '../../src/llm/repositories/conversationState.repository';

describe('Prisma write sanitizer middleware', () => {
  it('sanitizes ConversationState.upsert payloads before persistence', async () => {
    const prisma = new PrismaClientStub();
    registerPostgresSanitizerMiddleware(prisma as unknown as PrismaClient);
    const repository = new ConversationStateRepository(prisma as unknown as PrismaClient);

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

  it('sanitizes where filters on update operations so sanitized rows match', async () => {
    const prisma = new PrismaClientStub();
    registerPostgresSanitizerMiddleware(prisma as unknown as PrismaClient);

    await prisma.conversationState.update({
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
  private readonly middleware: Prisma.Middleware[] = [];
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

  $use(handler: Prisma.Middleware): void {
    this.middleware.push(handler);
  }

  private execute(action: Prisma.PrismaAction, model: string, args: unknown): Promise<unknown> {
    const params: Prisma.MiddlewareParams = { action, model, args };
    return this.dispatch(0, params);
  }

  private async dispatch(index: number, params: Prisma.MiddlewareParams): Promise<unknown> {
    const middleware = this.middleware[index];
    if (!middleware) {
      if (params.model === 'ConversationState' && params.action === 'upsert') {
        this.lastConversationStateUpsertArgs = params.args as Prisma.ConversationStateUpsertArgs;
      }
      if (params.model === 'ConversationState' && params.action === 'update') {
        this.lastConversationStateUpdateArgs = params.args as Prisma.ConversationStateUpdateArgs;
      }
      return params.args;
    }
    return middleware(params, (nextParams) => this.dispatch(index + 1, nextParams));
  }
}
