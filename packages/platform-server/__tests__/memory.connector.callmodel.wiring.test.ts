import { describe, it, expect } from 'vitest';
import { DeveloperMessage, SystemMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service';
import { createRunEventsStub, createEventsBusStub } from './helpers/runEvents.stub';
import type { ConfigService } from '../src/core/services/config.service';

class FakeLLM {
  lastInput: Array<SystemMessage | DeveloperMessage | { toJSON: () => unknown }> = [];
  async call(opts: { model: string; input: Array<SystemMessage | DeveloperMessage | { toJSON: () => unknown }> }) {
    this.lastInput = opts.input;
    return { text: 'ok', output: [] };
  }
}

const createReducer = (llm: FakeLLM, useDeveloperRole = false) => {
  const config = { llmUseDeveloperRole: useDeveloperRole } as unknown as ConfigService;
  return new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any, createEventsBusStub() as any, config);
};

describe('CallModel memory injection', () => {
  it('inserts memory after system; robust to summary presence', async () => {
    const llm = new FakeLLM();
    const reducer = createReducer(llm);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }) });
    // Explicitly avoid setting summary truthy, but assertions should be resilient
    await reducer.invoke(
      { messages: [], summary: undefined, context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
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
    const reducer = createReducer(llm);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S')], context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect((llm.lastInput[llm.lastInput.length - 1] as SystemMessage).text).toBe('MEM');
  });

  it('orders with summary present: after_system -> [System, Human(summary), System(memory), ...messages]', async () => {
    const llm = new FakeLLM();
    const reducer = createReducer(llm);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
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
    const reducer = createReducer(llm);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }) });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('S1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    const last = llm.lastInput[llm.lastInput.length - 1] as SystemMessage;
    expect(last.text).toBe('MEM');
  });

  it('uses developer role for instructions and memory when feature flag enabled', async () => {
    const llm = new FakeLLM();
    const reducer = createReducer(llm, true);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }),
    });
    await reducer.invoke(
      { messages: [SystemMessage.fromText('Legacy system')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );

    const developerMessages = llm.lastInput.filter((entry) => entry instanceof DeveloperMessage) as DeveloperMessage[];
    expect(developerMessages).not.toHaveLength(0);
    expect(developerMessages[0]?.text).toBe('SYS');
    expect(developerMessages.some((m) => m.text === 'MEM')).toBe(true);
    expect(llm.lastInput.some((entry) => entry instanceof SystemMessage)).toBe(false);
  });
});
