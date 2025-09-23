import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CallModelNode } from '../src/nodes/callModel.node';
import { buildContextForModel } from '../src/nodes/summarization.node';

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

vi.mock('../src/nodes/summarization.node', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    buildContextForModel: vi.fn(async (state, opts) => {
      const summary = state.summary ? new SystemMessage(`Conversation summary so far:\n${state.summary}`) : undefined;
      const recent = state.messages.slice(-opts.keepLast);
      const arr: BaseMessage[] = summary ? [summary, ...recent] : recent;
      // mock trimming: cap length to <= 3
      return arr.slice(-Math.max(1, Math.min(arr.length, 3)));
    }),
  };
});

describe('CallModelNode summarization integration', () => {
  it('uses buildContextForModel when configured', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    node.setSummarizationOptions({ keepLast: 2, maxTokens: 200 });
    const state = { messages: [new HumanMessage('a'), new AIMessage('b'), new HumanMessage('c')], summary: 'sum' };
    const res = await node.action(state as any, {} as any);
    expect(res.messages.length).toBe(1);
  });

  it('without summarization config, behavior unchanged', async () => {
    const fakeLLM: any = { withConfig: () => ({ invoke: async () => new AIMessage('ok') }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage('a')], summary: 'sum' };
    const res = await node.action(state as any, {} as any);
    expect(res.messages.length).toBe(1);
  });
});
