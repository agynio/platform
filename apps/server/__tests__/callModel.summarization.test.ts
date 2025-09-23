import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { CallModelNode } from '../src/nodes/callModel.node';

// Mock OpenAI LLM to avoid network
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    constructor(config: any) {
      super({ ...config, apiKey: 'mock' });
    }
    async invoke(_msgs: BaseMessage[], _opts?: any) {
      return new AIMessage('ok');
    }
    async getNumTokens(text: string): Promise<number> {
      return text.length;
    }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

describe('CallModelNode behavior', () => {
  it('invokes LLM using provided messages and system prompt', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage('a')], summary: 'sum' };
    const res = await node.action(state as any, {} as any);
    expect(res.messages.length).toBe(1);
  });

  it('without summary in state, still returns one AI message', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage('a')] };
    const res = await node.action(state as any, {} as any);
    expect(res.messages.length).toBe(1);
  });
});
