import { describe, it, expect } from 'vitest';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { countTokens, shouldSummarize, summarizationNode, SummarizationNode, type ChatState, type SummarizationOptions } from '../src/nodes/summarization.node';

// Lightweight mock implementing needed surface (cast to ChatOpenAI)
const llm = {
  getNumTokens: async (text: string) => text.length,
  invoke: async (_msgs: BaseMessage[]) => new AIMessage('SUMMARY'),
} as unknown as ChatOpenAI;

describe('summarization helpers', () => {

  it('countTokens counts string and messages using llm', async () => {
    expect(await countTokens(llm, 'abcd')).toBe(4);
    const msgs = [new HumanMessage('hello'), new AIMessage('world')];
    expect(await countTokens(llm, msgs)).toBe('helloworld'.length);
  });

  it('shouldSummarize false when total tokens within maxTokens', async () => {
    const state: ChatState = { messages: [new HumanMessage('a'), new AIMessage('b')], summary: '' };
    const opts: SummarizationOptions = { llm, keepTokens: 30, maxTokens: 100 } as any;
    expect(await shouldSummarize(state, opts)).toBe(false);
  });

  it('shouldSummarize true when token count exceeds maxTokens', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('a'), new AIMessage('b'), new HumanMessage('c'), new AIMessage('d')],
      summary: 'x'.repeat(50),
    };
    // total tokens ~ 4 messages (1 char each) + 50 summary = 54 > 30
    const opts: SummarizationOptions = { llm, keepTokens: 10, maxTokens: 30 } as any;
    expect(await shouldSummarize(state, opts)).toBe(true);
  });

  it('shouldSummarize false when older history exists but token budget not exceeded and no summary yet', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('1'), new AIMessage('2'), new HumanMessage('3'), new AIMessage('4'), new HumanMessage('5')],
    };
    const opts: SummarizationOptions = { llm, keepTokens: 40, maxTokens: 100 } as any;
    expect(await shouldSummarize(state, opts)).toBe(false);
  });

  it('summarizationNode returns non-empty summary and prunes messages to keepTokens budget tail', async () => {
    const state: ChatState = {
      messages: [new HumanMessage('1'), new AIMessage('2'), new HumanMessage('3'), new AIMessage('4'), new HumanMessage('5')],
      summary: '',
    };
    // keepTokens small enough to only retain last ~2 messages (approx by char length)
  const opts: SummarizationOptions = { llm, keepTokens: 1, maxTokens: 4 } as any;
    const out = await summarizationNode(state, opts as any);
    expect(out.summary && out.summary.length > 0).toBe(true);
    expect(out.messages.length).toBeGreaterThan(0);
    // Ensure tail are last original messages
    const originalTail = state.messages.slice(-out.messages.length).map((m) => m.content);
    const retainedTail = out.messages.map((m) => m.content);
    expect(retainedTail).toEqual(originalTail);
  });

    it('groupMessages groups AI tool_calls with following ToolMessages', () => {
      // Create an AI message with mocked tool_calls followed by two tool responses
    const ai = new AIMessage({
      content: 'Use tools',
      additional_kwargs: {
        tool_calls: [
          { id: 'tc1', type: 'function', function: { name: 't1', arguments: '{}' } },
        ],
      },
    }) as AIMessage & { tool_calls: any[] };
    (ai as any).tool_calls = [
      { id: 'tc1', type: 'function', function: { name: 't1', arguments: '{}' } },
    ];
      const t1 = new ToolMessage({ tool_call_id: 'tc1', name: 't1', content: 'result1' });
      const t2 = new ToolMessage({ tool_call_id: 'tc1', name: 't1', content: 'result2' });
      const after = new HumanMessage('next');
      const node = new SummarizationNode(llm, { keepTokens: 50, maxTokens: 100 });
      const groups = (node as any).groupMessages([new HumanMessage('hi'), ai, t1, t2, after]);
      expect(groups.length).toBe(3); // [Human], [AI, Tool, Tool], [Human]
      expect(groups[1].length).toBe(3);
      expect(groups[1][0]).toBe(ai);
      expect(groups[1][1]).toBe(t1);
      expect(groups[1][2]).toBe(t2);
    });

    it('groupMessages ignores orphan ToolMessages (no preceding AI tool_calls)', () => {
      const orphan = new ToolMessage({ tool_call_id: 'orphan', name: 'tool', content: 'data' });
      const node = new SummarizationNode(llm, { keepTokens: 10, maxTokens: 20 });
      const groups = (node as any).groupMessages([orphan, new HumanMessage('hello')]);
      // Orphan tool should be dropped; only the human message remains
      expect(groups.length).toBe(1);
      expect(groups[0][0]).toBeInstanceOf(HumanMessage);
    });
});
