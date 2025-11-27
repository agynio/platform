import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { Signal } from '../src/signal';
import { HumanMessage, ResponseMessage, SystemMessage } from '@agyn/llm';
import { RunEventStatus } from '@prisma/client';

const createRunEventsStub = () => ({
  startLLMCall: vi.fn(async () => ({ id: 'evt-1' })),
  publishEvent: vi.fn(async () => {}),
  completeLLMCall: vi.fn(async () => {}),
  createContextItems: vi.fn(async () => []),
  connectContextItemsToRun: vi.fn(async () => {}),
  createContextItemsAndConnect: vi.fn(async () => ({ messageIds: [] })),
});

const createEventsBusStub = () => ({
  publishEvent: vi.fn(async () => {}),
  subscribeToRunEvents: vi.fn(() => vi.fn()),
});

describe('CallModelLLMReducer termination handling', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns existing state and cancels event when terminateSignal active before call', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const llmCall = vi.fn();
    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({ llm: { call: llmCall } as any, model: 'test-model', systemPrompt: 'SYS', tools: [] });

    const state = { messages: [SystemMessage.fromText('SYS'), HumanMessage.fromText('hi')], context: { messageIds: [], memory: [] } } as any;
    const terminateSignal = new Signal();
    terminateSignal.activate();

    const result = await reducer.invoke(state, {
      threadId: 'thread-1',
      runId: 'run-1',
      finishSignal: new Signal(),
      terminateSignal,
      callerAgent: { getAgentNodeId: () => 'agent-1' } as any,
    });

    expect(result).toBe(state);
    expect(llmCall).not.toHaveBeenCalled();
    expect(runEvents.completeLLMCall).toHaveBeenCalledWith(expect.objectContaining({ status: RunEventStatus.cancelled }));
    expect(eventsBus.publishEvent).toHaveBeenLastCalledWith('evt-1', 'update');
  });

  it('marks LLM event cancelled when terminateSignal activates after call', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const terminateSignal = new Signal();
    const llmCall = vi.fn(async () => {
      const response = ResponseMessage.fromText('ok');
      terminateSignal.activate();
      return response;
    });

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({ llm: { call: llmCall } as any, model: 'test-model', systemPrompt: 'SYS', tools: [] });

    const state = { messages: [SystemMessage.fromText('SYS'), HumanMessage.fromText('step')], context: { messageIds: [], memory: [] } } as any;

    const result = await reducer.invoke(state, {
      threadId: 'thread-2',
      runId: 'run-2',
      finishSignal: new Signal(),
      terminateSignal,
      callerAgent: { getAgentNodeId: () => 'agent-1' } as any,
    });

    expect(result).toBe(state);
    expect(runEvents.completeLLMCall).toHaveBeenCalledWith(expect.objectContaining({ status: RunEventStatus.cancelled }));
    expect(runEvents.createContextItems).toHaveBeenCalledTimes(1);
    const inputs = runEvents.createContextItems.mock.calls[0][0] as Array<{ role?: string }>;
    const roles = inputs.map((item) => item.role);
    expect(roles).not.toContain('assistant');
  });
});
