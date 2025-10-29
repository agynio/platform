import { describe, it, expect, beforeEach } from 'vitest';
import { AIMessage, HumanMessage, ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { LLMState } from '../src/llm/types';

let reducer: SummarizationLLMReducer;

beforeEach(async () => {
  const provisioner: Pick<LLMProvisioner, 'getLLM'> = {
    getLLM: async () => ({ call: async () => new ResponseMessage({ output: [] }) } as any),
  };
  reducer = new SummarizationLLMReducer(provisioner as LLMProvisioner);
  await reducer.init({ model: 'gpt-5', keepTokens: 10, maxTokens: 30, systemPrompt: 'summarize' });
});

describe('SummarizationLLMReducer', () => {
  it('does not summarize when within token budget', async () => {
    const state: LLMState = { messages: [HumanMessage.fromText('a'), HumanMessage.fromText('b')], summary: '' };
    // With keepTokens=10 and maxTokens=30, small inputs may be pruned without summarization
    const out = await reducer.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.summary ?? '').toBe('');
  });

  it('summarizes when token count exceeds maxTokens', async () => {
    const prov: Pick<LLMProvisioner, 'getLLM'> = {
      getLLM: async () => ({ call: async () => new ResponseMessage({ output: [AIMessage.fromText('SUMMARY').toPlain()] }) } as any),
    };
    const r = new SummarizationLLMReducer(prov as LLMProvisioner);
    await r.init({ model: 'gpt-5', keepTokens: 10, maxTokens: 30, systemPrompt: 'summarize' });
    const msgs = Array.from({ length: 50 }).map((_, i) => HumanMessage.fromText(`m${i}`));
    const state: LLMState = { messages: msgs, summary: '' };
    const out = await r.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect((out.summary ?? '').length).toBeGreaterThan(0);
  });

  it('keeps tool call context and handles outputs during summarize', async () => {
    const call = new ToolCallMessage({ type: 'function_call', name: 't', call_id: 'c1', arguments: '{}' });
    const resp = new ResponseMessage({ output: [call.toPlain(), AIMessage.fromText('x').toPlain()] });
    const state: LLMState = { messages: [HumanMessage.fromText('h1'), resp], summary: '' };
    const out = await reducer.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.messages.length).toBeGreaterThan(0);
  });

  it('no-op when maxTokens=0 (skip)', async () => {
    const provisioner: Pick<LLMProvisioner, 'getLLM'> = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [] }) } as any) };
    const r = new SummarizationLLMReducer(provisioner as LLMProvisioner);
    await r.init({ model: 'gpt-5', keepTokens: 10, maxTokens: 0, systemPrompt: 'summarize' });
    const state: LLMState = { messages: [HumanMessage.fromText('a')], summary: '' };
    const out = await r.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.messages.map((m) => (m as any).type)).toEqual(state.messages.map((m) => (m as any).type));
    expect(out.summary ?? '').toBe(state.summary ?? '');
  });

  it('no-op when under budget', async () => {
    const provisioner: Pick<LLMProvisioner, 'getLLM'> = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [] }) } as any) };
    const r = new SummarizationLLMReducer(provisioner as LLMProvisioner);
    await r.init({ model: 'gpt-5', keepTokens: 1000, maxTokens: 2000, systemPrompt: 'summarize' });
    const state: LLMState = { messages: [HumanMessage.fromText('short')], summary: 'S' };
    const out = await r.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.summary ?? '').toBe('S');
    expect(out.messages.length).toBe(state.messages.length);
  });

  it('no-op when no messages', async () => {
    const provisioner: Pick<LLMProvisioner, 'getLLM'> = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [] }) } as any) };
    const r = new SummarizationLLMReducer(provisioner as LLMProvisioner);
    await r.init({ model: 'gpt-5', keepTokens: 10, maxTokens: 30, systemPrompt: 'summarize' });
    const state: LLMState = { messages: [], summary: 'S' };
    const out = await r.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.summary ?? '').toBe('S');
    expect(out.messages.length).toBe(0);
  });

  it('no-op when keepTokens large yields empty tail', async () => {
    const provisioner: Pick<LLMProvisioner, 'getLLM'> = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [] }) } as any) };
    const r = new SummarizationLLMReducer(provisioner as LLMProvisioner);
    await r.init({ model: 'gpt-5', keepTokens: 1000, maxTokens: 1000, systemPrompt: 'summarize' });
    const messages = Array.from({ length: 5 }).map((_, i) => HumanMessage.fromText(`m${i}`));
    const state: LLMState = { messages, summary: '' };
    const out = await r.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.messages.length).toBe(messages.length);
    expect(out.summary ?? '').toBe('');
  });
});
