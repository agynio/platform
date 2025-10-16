import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { CallModelNode } from '../src/lgnodes/callModel.lgnode';

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

describe('CallModelNode behavior', () => {
  it('invokes LLM using provided messages and system prompt', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage('a')], summary: 'sum' };
    const res = await node.action(state as any, {} as any);
  expect(res.messages?.items.length).toBe(1);
  });

  it('without summary in state, still returns one AI message', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage('a')] };
    const res = await node.action(state as any, {} as any);
  expect(res.messages?.items.length).toBe(1);
  });
});
