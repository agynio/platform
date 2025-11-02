import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';

class FakeLLM {
  lastInput: Array<SystemMessage | HumanMessage | { toJSON?: () => unknown; toPlain?: () => unknown }> = [];
  async call(opts: { model: string; input: Array<SystemMessage | HumanMessage | { toJSON?: () => unknown }> }) {
    this.lastInput = opts.input as any[];
    return { text: 'ok', output: [] } as any;
  }
}

describe('CallModelLLMReducer: summary injection', () => {
  it('inserts summary after system when present (unconditional)', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
  });

  it('respects memory placement with after_system (System, Human(sum), System(mem), ...)', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }),
    });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as SystemMessage).text).toBe('MEM');
    expect((llm.lastInput[3] as HumanMessage).text).toBe('H1');
  });

  it('respects memory placement with last_message (System, Human(sum), ..., System(mem))', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }),
    });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as HumanMessage).text).toBe('H1');
    expect((llm.lastInput[3] as SystemMessage).text).toBe('MEM');
  });

  it('does not inject when summary is empty/undefined', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: '' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[1] instanceof HumanMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('H1');
  });

  it('prevents duplicate summary injection when same text exists', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    const summary = 'SUM';
    await reducer.invoke({ messages: [HumanMessage.fromText(summary)], summary } as any, { threadId: 't' } as any);
    // Should be [System, existing HumanMessage, ...]; no extra summary injected
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect(llm.lastInput.filter((m) => m instanceof HumanMessage).length).toBe(1);
  });
  // No disabled flag test: summary injection is unconditional when summary is present.
});
