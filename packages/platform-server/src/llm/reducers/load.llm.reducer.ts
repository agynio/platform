import { Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import { LoggerService } from '../../services/logger.service';
import { deserializeState } from '../utils/serialization';

@Injectable()
export class LoadLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private logger: LoggerService) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    try {
      const prisma = PrismaService.getInstance(this.logger).getClient();
      if (!prisma) return state; // persistence disabled
      const repo = new ConversationStateRepository(prisma);
      const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';
      const existing = await repo.get(ctx.threadId, nodeId);
      if (!existing?.state) return state;
      // Merge: existing.messages + incoming messages; keep latest summary
      const persisted = deserializeState(existing.state);
      const merged: LLMState = {
        summary: persisted.summary,
        messages: [...persisted.messages, ...state.messages],
      };
      return merged;
    } catch (e) {
      this.logger.error('LoadLLMReducer error: %s', (e as Error)?.message || String(e));
      return state;
    }
  }
}
