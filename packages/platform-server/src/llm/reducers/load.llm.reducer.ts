import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ConversationStateRepository } from '../repositories/conversationState.repository';
import type { LLMContext, LLMContextState, LLMState } from '../types';

import { PersistenceBaseLLMReducer } from './persistenceBase.llm.reducer';

@Injectable()
export class LoadLLMReducer extends PersistenceBaseLLMReducer {
  private readonly logger = new Logger(LoadLLMReducer.name);
  constructor(
    @Inject(PrismaService) private prismaService: PrismaService,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    try {
      const prisma = this.prismaService.getClient();
      const repo = new ConversationStateRepository(prisma);
      const nodeId = ctx.callerAgent.getAgentNodeId?.() || 'agent';
      const incomingContext = this.ensureContext(state.context);
      const existing = await repo.get(ctx.threadId, nodeId);
      if (!existing?.state) {
        return { ...state, context: incomingContext };
      }
      // Merge: existing.messages + incoming messages; keep latest summary
      if (!this.isPlainLLMState(existing.state)) {
        return { ...state, context: incomingContext };
      }
      const persisted = this.deserializeState(existing.state);

      const persistedContext = this.ensureContext(persisted.context);

      const mergedContext: LLMContextState = {
        messageIds: [...persistedContext.messageIds, ...incomingContext.messageIds],
        memory: incomingContext.memory.length > 0 ? incomingContext.memory : persistedContext.memory,
        summary: incomingContext.summary ?? persistedContext.summary,
        system: persistedContext.system ?? incomingContext.system,
      };

      const merged: LLMState = {
        summary: persisted.summary ?? state.summary,
        messages: [...persisted.messages, ...state.messages],
        context: mergedContext,
        meta: state.meta,
      };
      return merged;
    } catch (e) {
      const errorInfo =
        e instanceof Error
          ? { name: e.name, message: e.message, stack: e.stack }
          : { message: String(e) };
      this.logger.error(`LoadLLMReducer failed ${JSON.stringify({ threadId: ctx.threadId, error: errorInfo })}`);
      return { ...state, context: this.ensureContext(state.context) };
    }
  }

  private ensureContext(context: LLMContextState | undefined): LLMContextState {
    if (!context) return { messageIds: [], memory: [], pendingNewContextItemIds: [] };
    return {
      messageIds: [...(context.messageIds ?? [])],
      memory: [...(context.memory ?? [])],
      summary: context.summary ? { ...context.summary } : undefined,
      system: context.system ? { ...context.system } : undefined,
      pendingNewContextItemIds: context.pendingNewContextItemIds
        ? [...context.pendingNewContextItemIds]
        : undefined,
    };
  }
}
