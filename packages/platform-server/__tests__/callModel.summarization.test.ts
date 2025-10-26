import { describe, it, expect, beforeEach } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { HumanMessage, ResponseMessage } from '@agyn/llm';

// Minimal fake LLM to avoid network; returns a single assistant output text
class FakeLLM {
  async call(_params: { model: string; input: Array<any>; tools?: Array<any> }) {
    return new ResponseMessage({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'ok' }],
        },
      ],
    } as any);
  }
}

describe('CallModel reducers behavior', () => {
  let reducer: CallModelLLMReducer;

  beforeEach(async () => {
    reducer = new CallModelLLMReducer();
    reducer.init({ llm: new FakeLLM() as any, model: 'gpt-4o-mini', systemPrompt: 'SYS', tools: [] });
  });

  it('invokes LLM using provided messages and system prompt', async () => {
    const state = { messages: [HumanMessage.fromText('a')], summary: 'sum' } as any;
    const res = await reducer.invoke(state, {} as any);
    expect(res.messages.at(-1)).toBeInstanceOf(ResponseMessage);
    expect((res.messages.at(-1) as ResponseMessage).text).toBe('ok');
  });

  it('without summary in state, still returns one assistant output message', async () => {
    const state = { messages: [HumanMessage.fromText('a')] } as any;
    const res = await reducer.invoke(state, {} as any);
    expect(res.messages.at(-1)).toBeInstanceOf(ResponseMessage);
    expect((res.messages.at(-1) as ResponseMessage).text).toBe('ok');
  });
});
