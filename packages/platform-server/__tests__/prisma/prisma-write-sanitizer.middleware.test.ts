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

    const recorded = prisma.lastConversationStateArgs;
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
});

class PrismaClientStub {
  private readonly middleware: Prisma.Middleware[] = [];
  public lastConversationStateArgs?: Prisma.ConversationStateUpsertArgs;

  public readonly conversationState: PrismaClient['conversationState'];

  constructor() {
    this.conversationState = {
      upsert: (args: Prisma.ConversationStateUpsertArgs) =>
        this.execute('upsert', 'ConversationState', args),
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
        this.lastConversationStateArgs = params.args as Prisma.ConversationStateUpsertArgs;
      }
      return params.args;
    }
    return middleware(params, (nextParams) => this.dispatch(index + 1, nextParams));
  }
}
