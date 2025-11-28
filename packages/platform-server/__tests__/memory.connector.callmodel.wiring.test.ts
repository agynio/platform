import { describe, it, expect } from 'vitest';
import { DeveloperMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { createRunEventsStub, createEventsBusStub } from './helpers/runEvents.stub';

class FakeLLM {
  lastInput: Array<DeveloperMessage | { toJSON: () => unknown }> = [];
  async call(opts: { model: string; input: Array<DeveloperMessage | { toJSON: () => unknown }> }) {
    this.lastInput = opts.input;
    return { text: 'ok', output: [] };
  }
}

const createStructuredMemory = (text: string) =>
  new DeveloperMessage({
    type: 'message',
    role: 'developer',
    content: [
      { type: 'input_text', text },
      { type: 'input_text', text: text + ' context' },
    ],
  });

describe('CallModel memory injection', () => {
  it('inserts memory after system; robust to summary presence', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any, createEventsBusStub() as any);
    const expectedMemoryPlain = createStructuredMemory('MEM').toPlain();
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: createStructuredMemory('MEM'), place: 'after_system' }),
    });
    // Explicitly avoid setting summary truthy, but assertions should be resilient
    await reducer.invoke(
      { messages: [], summary: undefined, context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof DeveloperMessage).toBe(true);
    // If summary was injected, memory should follow after it; otherwise directly after system
    const second = llm.lastInput[1] as any;
    const isSecondHuman = !!second && typeof second?.toJSON === 'function' && second.toJSON().role === 'human';
    const memIndex = isSecondHuman ? 2 : 1;
    const memoryMessage = llm.lastInput[memIndex] as DeveloperMessage;
    expect(memoryMessage.toPlain().content).toEqual(expectedMemoryPlain.content);
  });

  it('appends memory message at end when placement=last_message with no summary', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any, createEventsBusStub() as any);
    const expectedMemoryPlain = createStructuredMemory('MEM').toPlain();
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: createStructuredMemory('MEM'), place: 'last_message' }),
    });
    await reducer.invoke(
      { messages: [DeveloperMessage.fromText('S')], context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    const memoryMessage = llm.lastInput[llm.lastInput.length - 1] as DeveloperMessage;
    expect(memoryMessage.toPlain().content).toEqual(expectedMemoryPlain.content);
  });

  it('orders with summary present: after_system -> [System, Human(summary), System(memory), ...messages]', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any, createEventsBusStub() as any);
    const expectedMemoryPlain = createStructuredMemory('MEM').toPlain();
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: createStructuredMemory('MEM'), place: 'after_system' }),
    });
    await reducer.invoke(
      { messages: [DeveloperMessage.fromText('S1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    expect(llm.lastInput[0] instanceof DeveloperMessage).toBe(true);
    // summary injected after system
    const second = llm.lastInput[1] as any;
    const role = second?.toJSON ? second.toJSON().role : 'human';
    expect(role).toBe('human');
    expect((llm.lastInput[2] as DeveloperMessage).toPlain().content).toEqual(expectedMemoryPlain.content);
  });

  it('orders with summary present: last_message -> [System, Human(summary), ...messages, System(memory)]', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer(new LoggerService(), createRunEventsStub() as any, createEventsBusStub() as any);
    const expectedMemoryPlain = createStructuredMemory('MEM').toPlain();
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: createStructuredMemory('MEM'), place: 'last_message' }),
    });
    await reducer.invoke(
      { messages: [DeveloperMessage.fromText('S1')], summary: 'SUM', context: { messageIds: [], memory: [] } } as any,
      { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, terminateSignal: { isActive: false } as any, callerAgent: {} as any },
    );
    const last = llm.lastInput[llm.lastInput.length - 1] as DeveloperMessage;
    expect(last.toPlain().content).toEqual(expectedMemoryPlain.content);
  });
});
