import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import { PersistenceBaseLLMReducer } from './persistenceBase.llm.reducer';
import { LoggerService } from '../../core/services/logger.service';

@Injectable()
export class SaveLLMReducer extends PersistenceBaseLLMReducer {
  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(PrismaService) private prismaService: PrismaService,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    try {
      const prisma = this.prismaService.getClient();
      if (!prisma) return state; // persistence disabled

      const repo = new ConversationStateRepository(prisma);
      const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';
      await repo.upsert({ threadId: ctx.threadId, nodeId, state: this.toJsonValue(this.serializeState(state)) });
      return state;
    } catch (e) {
      this.logger.error('SaveLLMReducer error: %s', (e as Error)?.message || String(e));
      return state;
    }
  }
}
