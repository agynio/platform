import { describe, expect, it, vi } from 'vitest';
import { HumanMessage, ResponseMessage, ToolCallMessage, AIMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';

type MockFn = ReturnType<typeof vi.fn>;

const createCtx = () =>
  ({
    threadId: 'thread-ctx',
    runId: 'run-ctx',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { getAgentNodeId: () => 'agent-node' },
  }) as any;

describe('LLM new context item counting', () => {
  it('counts pre-call batched conversation items and assistant response', async () => {
    const runEvents = createRunEventsStub();
    const startLLMCall = runEvents.startLLMCall as unknown as MockFn;
    const updateLLMCallContextCount = runEvents.updateLLMCallContextCount as unknown as MockFn;
    const eventsBus = createEventsBusStub();

    const llm = { call: vi.fn(async () => ResponseMessage.fromText('ack')) };

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-prebatch',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [
        HumanMessage.fromText('hello'),
        HumanMessage.fromText('second message'),
        HumanMessage.fromText('final note'),
      ],
      context: { messageIds: [], memory: [], system: { id: 'ctx-system-1' } },
      meta: {},
    } as any;

    const ctx = createCtx();

    const result = await reducer.invoke(initialState, ctx);

    expect(startLLMCall).toHaveBeenCalledTimes(1);
    expect(startLLMCall.mock.calls[0][0]?.newContextItemCount).toBe(3);

    expect(updateLLMCallContextCount).toHaveBeenCalledTimes(1);
    const [eventId, updatedCount] = updateLLMCallContextCount.mock.calls[0];
    expect(updatedCount).toBe(4);
    expect(eventId).toBe(result.meta?.lastLLMEventId);

    expect(result.meta?.turnNewContextCountSoFar).toBe(4);
    expect(result.context.messageIds).toHaveLength(4);
  });

  it('accumulates assistant tool call requests and tool results', async () => {
    const runEvents = createRunEventsStub();
    const startLLMCall = runEvents.startLLMCall as unknown as MockFn;
    const updateLLMCallContextCount = runEvents.updateLLMCallContextCount as unknown as MockFn;
    const eventsBus = createEventsBusStub();

    const toolCalls = [
      new ToolCallMessage({
        type: 'function_call',
        call_id: 'call-alpha',
        name: 'alpha',
        arguments: JSON.stringify({ x: 1 }),
      } as any),
      new ToolCallMessage({
        type: 'function_call',
        call_id: 'call-beta',
        name: 'beta',
        arguments: JSON.stringify({ y: 2 }),
      } as any),
    ];
    const responseWithTools = new ResponseMessage({ output: toolCalls.map((call) => call.toPlain() as any) as any });

    const llm = { call: vi.fn(async () => responseWithTools) };

    const callModel = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-tools',
      systemPrompt: 'SYS',
      tools: [],
    });

    const makeTool = (name: string) => ({
      name,
      description: `${name} tool`,
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => `${name}-result`),
    });
    const tools = [makeTool('alpha'), makeTool('beta')];

    const callTools = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: tools as any });

    const initialState = {
      messages: [HumanMessage.fromText('run tool please')],
      context: { messageIds: [], memory: [], system: { id: 'ctx-system-2' } },
      meta: {},
    } as any;

    const ctx = createCtx();

    const afterModel = await callModel.invoke(initialState, ctx);

    expect(startLLMCall).toHaveBeenCalledTimes(1);
    expect(startLLMCall.mock.calls[0][0]?.newContextItemCount).toBe(1);

    expect(updateLLMCallContextCount).toHaveBeenCalledTimes(1);
    expect(updateLLMCallContextCount.mock.calls[0][1]).toBe(4);

    expect(afterModel.meta?.turnNewContextCountSoFar).toBe(4);

    const afterTools = await callTools.invoke(afterModel, ctx);

    expect(updateLLMCallContextCount).toHaveBeenCalledTimes(2);
    const [, toolResultCount] = updateLLMCallContextCount.mock.calls[1];
    expect(toolResultCount).toBe(6);
    expect(afterTools.meta?.turnNewContextCountSoFar).toBe(6);
  });

  it('includes injected messages in the pre-call count', async () => {
    const runEvents = createRunEventsStub();
    const startLLMCall = runEvents.startLLMCall as unknown as MockFn;
    const updateLLMCallContextCount = runEvents.updateLLMCallContextCount as unknown as MockFn;
    const eventsBus = createEventsBusStub();

    const llm = { call: vi.fn(async () => ResponseMessage.fromText('ok')) };

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-injection',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [
        HumanMessage.fromText('persisted prior message'),
        HumanMessage.fromText('new user prompt'),
        AIMessage.fromText('injected instruction'),
      ],
      context: { messageIds: ['ctx-existing'], memory: [], system: { id: 'ctx-system-3' } },
      meta: {},
    } as any;

    const ctx = createCtx();

    const result = await reducer.invoke(initialState, ctx);

    expect(startLLMCall).toHaveBeenCalledTimes(1);
    expect(startLLMCall.mock.calls[0][0]?.newContextItemCount).toBe(2);

    expect(updateLLMCallContextCount).toHaveBeenCalledTimes(1);
    expect(updateLLMCallContextCount.mock.calls[0][1]).toBe(3);
    expect(result.meta?.turnNewContextCountSoFar).toBe(3);
  });

  it('preserves counts after summarization-style trimming before the next turn', async () => {
    const runEvents = createRunEventsStub();
    const startLLMCall = runEvents.startLLMCall as unknown as MockFn;
    const updateLLMCallContextCount = runEvents.updateLLMCallContextCount as unknown as MockFn;
    const eventsBus = createEventsBusStub();

    const llm = {
      call: vi
        .fn()
        .mockResolvedValueOnce(ResponseMessage.fromText('first turn'))
        .mockResolvedValue(ResponseMessage.fromText('second turn')),
    };

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-summarization',
      systemPrompt: 'SYS',
      tools: [],
    });

    const ctx = createCtx();

    const turnOneState = {
      messages: [HumanMessage.fromText('kick off')],
      context: { messageIds: [], memory: [], system: { id: 'ctx-system-4' } },
      meta: {},
    } as any;

    const afterFirstTurn = await reducer.invoke(turnOneState, ctx);

    const assistantContextIds = afterFirstTurn.context.messageIds.slice();

    // Mimic summarization clearing older conversation entries by keeping only the latest assistant context item.
    const summarizedState = {
      ...afterFirstTurn,
      messages: afterFirstTurn.messages.slice(-1),
      context: {
        ...afterFirstTurn.context,
        messageIds: assistantContextIds.slice(-1),
      },
      meta: {},
    } as any;

    startLLMCall.mockClear();
    updateLLMCallContextCount.mockClear();

    const turnTwoState = {
      ...summarizedState,
      messages: [...summarizedState.messages, HumanMessage.fromText('next prompt')],
    } as any;

    const afterSecondTurn = await reducer.invoke(turnTwoState, ctx);

    expect(startLLMCall).toHaveBeenCalledTimes(1);
    expect(startLLMCall.mock.calls[0][0]?.newContextItemCount).toBe(1);

    expect(updateLLMCallContextCount).toHaveBeenCalledTimes(1);
    expect(updateLLMCallContextCount.mock.calls[0][1]).toBe(2);
    expect(afterSecondTurn.meta?.turnNewContextCountSoFar).toBe(2);
  });
});
