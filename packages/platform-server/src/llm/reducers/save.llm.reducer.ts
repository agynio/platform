import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import { LoggerService } from '../../services/logger.service';
import { serializeState } from '../utils/serialization';

@Injectable()
export class SaveLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private logger: LoggerService) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    try {
      const prisma = PrismaService.getInstance(this.logger).getClient();
      if (!prisma) return state; // persistence disabled
      const repo = new ConversationStateRepository(prisma);
      const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';
      await repo.upsert({ threadId: ctx.threadId, nodeId, state: serializeState(state) });
      return state;
    } catch (e) {
      this.logger.error('SaveLLMReducer error: %s', (e as Error)?.message || String(e));
      return state;
    }
  }
}
