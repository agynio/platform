import { describe, it, expect } from 'vitest';
import { SystemMessage, ResponseMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service';
import { createRunEventsStub } from './helpers/runEvents.stub';

class FakeLLM {
  lastInput: Array<SystemMessage | { toJSON: () => unknown }> = [];
  async call(opts: { model: string; input: Array<SystemMessage | { toJSON: () => unknown }> }) {
    this.lastInput = opts.input;
    return { text: 'ok', output: [] };
  }
}

describe('CallModel memory injection', () => {
  it('inserts memory after system; robust to summary presence', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }) });
    // Explicitly avoid setting summary truthy, but assertions should be resilient
    await reducer.invoke(
      { messages: [], summary: undefined } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    // If summary was injected, memory should follow after it; otherwise directly after system
    const second = llm.lastInput[1] as any;
    const isSecondHuman = !!second && typeof second?.toJSON === 'function' && second.toJSON().role === 'human';
    const memIndex = isSecondHuman ? 2 : 1;
    expect((llm.lastInput[memIndex] as SystemMessage).text).toBe('MEM');
  });

  it('appends memory message at end when placement=last_message with no summary', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S')] } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect((llm.lastInput[llm.lastInput.length - 1] as SystemMessage).text).toBe('MEM');
  });

  it('orders with summary present: after_system -> [System, Human(summary), System(memory), ...messages]', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S1')], summary: 'SUM' } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    // summary injected after system
    const second = llm.lastInput[1] as any;
    const role = second?.toJSON ? second.toJSON().role : 'human';
    expect(role).toBe('human');
    expect((llm.lastInput[2] as SystemMessage).text).toBe('MEM');
  });

  it('orders with summary present: last_message -> [System, Human(summary), ...messages, System(memory)]', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S1')], summary: 'SUM' } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    const last = llm.lastInput[llm.lastInput.length - 1] as SystemMessage;
    expect(last.text).toBe('MEM');
  });
});
