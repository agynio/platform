import type { LLMContext, LLMState } from '../types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import { PersistenceBaseLLMReducer } from './persistenceBase.llm.reducer';
import { toPrismaJsonValue } from '../services/messages.serialization';

@Injectable()
export class SaveLLMReducer extends PersistenceBaseLLMReducer {
  private readonly logger = new Logger(SaveLLMReducer.name);
  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    const prisma = this.prismaService.getClient();
    const repo = new ConversationStateRepository(prisma);
    const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';

    const serialized = toPrismaJsonValue(this.serializeState(state));
    try {
      await repo.upsert({ threadId: ctx.threadId, nodeId, state: serialized == null ? {} : serialized });
    } catch (e) {
      const errorInfo =
        e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) };
      this.logger.error(
        `SaveLLMReducer: conversation state persist failed ${JSON.stringify({ threadId: ctx.threadId, nodeId, error: errorInfo })}`,
      );
      // Propagate error to enforce fail-fast
      throw e;
    }
    return state;
  }
}
