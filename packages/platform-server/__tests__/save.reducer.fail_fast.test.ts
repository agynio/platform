import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { PrismaService } from '../src/core/services/prisma.service';
import { SaveLLMReducer } from '../src/llm/reducers/save.llm.reducer';
import { ConversationStateRepository } from '../src/llm/repositories/conversationState.repository';
import { HumanMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { Signal } from '../src/signal';


describe('SaveLLMReducer fail-fast', () => {
  it('bubbles persistence error from upsert', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: PrismaService, useValue: { getClient: () => ({}) } },
        SaveLLMReducer,
      ],
    }).compile();

    const logger = module.get(LoggerService);
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Force ConversationStateRepository.upsert to throw
    vi.spyOn(ConversationStateRepository.prototype, 'upsert').mockRejectedValue(new Error('persist_fail'));

    const reducer = await module.resolve(SaveLLMReducer);
    const state: LLMState = { messages: [HumanMessage.fromText('hello')], context: { messageIds: [], memory: [] } };
    const ctx: LLMContext = { threadId: 't1', runId: 'r1', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { getAgentNodeId: () => 'A', invoke: async () => new Promise(() => {}) } };

    await expect(reducer.invoke(state, ctx)).rejects.toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });
});
