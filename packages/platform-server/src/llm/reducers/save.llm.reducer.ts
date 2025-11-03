import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import { PersistenceBaseLLMReducer } from './persistenceBase.llm.reducer';
import { toPrismaJsonValue } from '../services/messages.serialization';
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
    const prisma = this.prismaService.getClient();
    const repo = new ConversationStateRepository(prisma);
    const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';

    const serialized = toPrismaJsonValue(this.serializeState(state));
    await repo.upsert({ threadId: ctx.threadId, nodeId, state: serialized == null ? {} : serialized });
    return state;
  }
}
