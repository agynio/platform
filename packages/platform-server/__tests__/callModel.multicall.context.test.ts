import { describe, it, expect, vi } from 'vitest';
import { HumanMessage, ResponseMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';
import type { LLMContext, LLMState } from '../src/llm/types';

describe('CallModelLLMReducer multi-call context propagation', () => {
  it('feeds prior outputs into the next call input list', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const llm = { call: vi.fn() };

    llm.call.mockResolvedValueOnce(ResponseMessage.fromText('assistant #1'));
    llm.call.mockResolvedValueOnce(ResponseMessage.fromText('assistant #2'));

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'unit-test-model',
      systemPrompt: 'System prompt',
      tools: [],
    });

    const ctx: LLMContext = {
      threadId: 'thread-1',
      runId: 'run-1',
      finishSignal: new Signal(false),
      terminateSignal: new Signal(false),
      callerAgent: {
        invoke: vi.fn(),
        getAgentNodeId: () => 'node-1',
      },
    };

    const initialState: LLMState = {
      messages: [HumanMessage.fromText('user question #1')],
      context: {
        messageIds: ['ctx-user-1'],
        system: { id: 'ctx-system' },
        memory: [],
        pendingNewContextItemIds: [],
      },
    };

    type ViMock = ReturnType<typeof vi.fn>;
    const createContextItemsMock = runEvents.createContextItems as unknown as ViMock;
    createContextItemsMock
      .mockResolvedValueOnce(['ctx-assistant-1'])
      .mockResolvedValueOnce(['ctx-user-2'])
      .mockResolvedValueOnce(['ctx-assistant-2']);

    const firstState = await reducer.invoke(initialState, ctx);
    expect(firstState.context.messageIds).toEqual(['ctx-user-1', 'ctx-assistant-1']);

    const secondInputState: LLMState = {
      ...firstState,
      messages: [...firstState.messages, HumanMessage.fromText('user question #2')],
    };

    await reducer.invoke(secondInputState, ctx);

    const startLLMCallMock = runEvents.startLLMCall as unknown as ViMock;
    expect(startLLMCallMock).toHaveBeenCalledTimes(2);
    expect(startLLMCallMock.mock.calls[0]?.[0]?.contextItemIds).toEqual(['ctx-system', 'ctx-user-1']);
    expect(startLLMCallMock.mock.calls[0]?.[0]?.newContextItemIds).toEqual([]);
    expect(startLLMCallMock.mock.calls[1]?.[0]?.contextItemIds).toEqual([
      'ctx-system',
      'ctx-user-1',
      'ctx-assistant-1',
      'ctx-user-2',
    ]);
    expect(startLLMCallMock.mock.calls[1]?.[0]?.newContextItemIds).toEqual(['ctx-assistant-1', 'ctx-user-2']);

    const appendMock = runEvents.appendLLMCallContextItems as unknown as ViMock;
    expect(appendMock).not.toHaveBeenCalled();

    expect(createContextItemsMock).toHaveBeenCalledTimes(3);
  });
});
