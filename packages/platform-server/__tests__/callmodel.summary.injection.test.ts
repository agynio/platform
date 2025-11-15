import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service';
import { createRunEventsStub } from './helpers/runEvents.stub';

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
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke(
      { messages: [HumanMessage.fromText('H1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
  });

  it('respects memory placement with after_system (System, Human(sum), System(mem), ...)', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }),
    });
    await reducer.invoke(
      { messages: [HumanMessage.fromText('H1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as SystemMessage).text).toBe('MEM');
    expect((llm.lastInput[3] as HumanMessage).text).toBe('H1');
  });

  it('respects memory placement with last_message (System, Human(sum), ..., System(mem))', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }),
    });
    await reducer.invoke(
      { messages: [HumanMessage.fromText('H1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as HumanMessage).text).toBe('H1');
    expect((llm.lastInput[3] as SystemMessage).text).toBe('MEM');
  });

  it('does not inject when summary is empty/undefined', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke(
      { messages: [HumanMessage.fromText('H1')], summary: '', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[1] instanceof HumanMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('H1');
  });

  it('still injects summary even if identical text exists in messages', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    const summary = 'SUM';
    await reducer.invoke(
      { messages: [HumanMessage.fromText(summary)], summary, context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    // Summary should be injected after system, even if an identical HumanMessage exists later
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    // There will be two HumanMessages with the same text: injected summary and existing message
    expect(llm.lastInput.filter((m) => m instanceof HumanMessage).length).toBe(2);
  });
  // No disabled flag test: summary injection is unconditional when summary is present.
});
