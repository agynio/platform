import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';

// Mock OpenAI LLM to avoid network
vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    constructor(_config: any) {}
    withConfig() {
      return { invoke: async () => new AIMessage('ok') };
    }
  }
  return { ChatOpenAI: MockChatOpenAI } as any;
});

describe('CallModel reducers behavior', () => {
  it('invokes LLM using provided messages and system prompt', async () => {
    const reducer = new CallModelLLMReducer(new LoggerService() as any);
    reducer.init({ model: 'gpt-4o-mini', systemPrompt: '' } as any);
    const state = { messages: [new HumanMessage('a')], summary: 'sum' } as any;
    const ctx = { callerAgent: { config: { systemPrompt: 'SYS' } } } as any;
    const res = await reducer.invoke(state, ctx);
    expect(res.messages.at(-1)).toBeInstanceOf(AIMessage);
  });

  it('without summary in state, still returns one AI message', async () => {
    const reducer = new CallModelLLMReducer(new LoggerService() as any);
    reducer.init({ model: 'gpt-4o-mini', systemPrompt: '' } as any);
    const state = { messages: [new HumanMessage('a')] } as any;
    const ctx = { callerAgent: { config: { systemPrompt: 'SYS' } } } as any;
    const res = await reducer.invoke(state, ctx);
    expect(res.messages.at(-1)).toBeInstanceOf(AIMessage);
  });
});
