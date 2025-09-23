import { describe, it, expect } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import {
  buildContextForModel,
  countTokens,
  shouldSummarize,
  summarizationNode,
  SummarizationNode,
  type ChatState,
  type SummarizationOptions,
} from '../src/nodes/summarization.node';

class MockLLM extends ChatOpenAI {
  constructor() {
    // @ts-expect-error allow no api key
    super({ apiKey: 'mock', model: 'gpt-5' });
  }
  async getNumTokens(text: string): Promise<number> {
    return text.length;
  }
  async invoke(_msgs: BaseMessage[]): Promise<AIMessage> {
    return new AIMessage('SUMMARY');
  }
}

describe('summarization helpers', () => {
  const llm = new MockLLM();

  it('countTokens counts string and messages using llm', async () => {
    expect(await countTokens(llm, 'abcd')).toBe(4);
    const msgs = [new HumanMessage('hello'), new AIMessage('world')];
    expect(await countTokens(llm, msgs)).toBe('helloworld'.length);
  });

  it('shouldSummarize false when <= keepLast', async () => {
    const state: ChatState = { messages: [new HumanMessage('a'), new AIMessage('b')], summary: '' };
    const opts: SummarizationOptions = { llm, keepLast: 3, maxTokens: 100 } as any;
    expect(await shouldSummarize(state, opts)).toBe(false);
  });

  it('shouldSummarize true when token count of (summary + last K) > maxTokens', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('a'), new AIMessage('b'), new HumanMessage('c'), new AIMessage('d')],
      summary: 'x'.repeat(50),
    };
    const opts: SummarizationOptions = { llm, keepLast: 2, maxTokens: 10 } as any;
    expect(await shouldSummarize(state, opts)).toBe(true);
  });

  it('shouldSummarize false when older history exists but token budget not exceeded and no summary yet', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('1'), new AIMessage('2'), new HumanMessage('3'), new AIMessage('4'), new HumanMessage('5')],
    };
    const opts: SummarizationOptions = { llm, keepLast: 2, maxTokens: 100 } as any;
    expect(await shouldSummarize(state, opts)).toBe(false);
  });

  it('summarizationNode returns non-empty summary and prunes messages to last K', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('1'), new AIMessage('2'), new HumanMessage('3'), new AIMessage('4'), new HumanMessage('5')],
      summary: '',
    };
    const opts: SummarizationOptions = { llm, keepLast: 2, maxTokens: 100 } as any;
    const out = await summarizationNode(state, opts);
    expect(out.summary && out.summary.length > 0).toBe(true);
    expect(out.messages.length).toBe(2);
  });
});
