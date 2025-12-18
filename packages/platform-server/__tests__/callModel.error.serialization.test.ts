import { describe, it, expect, vi } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { HumanMessage, SystemMessage } from '@agyn/llm';
import { RunEventStatus } from '@prisma/client';
import { Signal } from '../src/signal';

const createRunEventsStub = () => ({
  startLLMCall: vi.fn(async () => ({ id: 'evt-llm' })),
  completeLLMCall: vi.fn(async () => {}),
  createContextItems: vi.fn(async () => []),
  appendLLMCallContextItems: vi.fn(async () => {}),
});

const createEventsBusStub = () => ({
  publishEvent: vi.fn(async () => {}),
});

describe('CallModelLLMReducer error serialization', () => {
  it('records error message, code, and raw response when LLM call throws', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const failingCall = vi.fn(async () => {
      throw new Error('model explosion');
    });

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: { call: failingCall } as any,
      model: 'test-model',
      systemPrompt: 'SYS',
      tools: [],
    });

    const state = {
      messages: [SystemMessage.fromText('SYS'), HumanMessage.fromText('start')],
      context: { messageIds: [], memory: [], pendingNewContextItemIds: [] },
      meta: {},
    } as any;

    await expect(
      reducer.invoke(state, {
        threadId: 'thread-err',
        runId: 'run-err',
        finishSignal: new Signal(),
        terminateSignal: new Signal(),
        callerAgent: { getAgentNodeId: () => 'agent-err' } as any,
      }),
    ).rejects.toThrow('model explosion');

    expect(runEvents.completeLLMCall).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-llm',
        status: RunEventStatus.error,
        errorMessage: 'model explosion',
        errorCode: 'Error',
      }),
    );

    const callArgs = runEvents.completeLLMCall.mock.calls.at(-1)?.[0];
    expect(callArgs).toBeTruthy();
    const raw = callArgs?.rawResponse as Record<string, unknown> | null | undefined;
    expect(raw && typeof raw === 'object' ? raw.message : undefined).toBe('model explosion');
    expect(raw && typeof raw === 'object' ? raw.name : undefined).toBe('Error');
  });

});
