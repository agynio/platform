import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadLLMReducer } from '../src/llm/reducers/load.llm.reducer';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { ConversationStateRepository } from '../src/llm/repositories/conversationState.repository';
import { Signal } from '../src/signal';
import type { LLMContext, LLMState } from '../src/llm/types';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { RunEventsService } from '../src/events/run-events.service';
import type { EventsBusService } from '../src/events/events-bus.service';
import { AIMessage, ResponseMessage, ToolCallMessage, type LLM } from '@agyn/llm';

const prismaServiceStub = {
  getClient: () => ({}),
} as unknown as PrismaService;

const THREAD_ID = 'thread-merge';
const NODE_ID = 'agent';

function baseContext(): LLMContext {
  const response = ResponseMessage.fromText('noop');
  return {
    threadId: THREAD_ID,
    runId: 'run-1',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: {
      getAgentNodeId: () => NODE_ID,
      invoke: async () => response,
    },
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function setupPersistedState(
  reducer: LoadLLMReducer,
  persisted: LLMState,
  ctx: LLMContext,
): void {
  vi.spyOn(ConversationStateRepository.prototype, 'get').mockResolvedValue({
    threadId: ctx.threadId,
    nodeId: NODE_ID,
    state: reducer['serializeState'](persisted),
  });
}

function callReducerWithMocks(llmCallMock: ReturnType<typeof vi.fn>): CallModelLLMReducer {
  const runEventsStub = {
    startLLMCall: vi.fn(async () => ({ id: 'llm-event-id' })),
    completeLLMCall: vi.fn(async () => {}),
    createContextItems: vi.fn(async () => ['ctx-assistant']),
    publishEvent: vi.fn(async () => null),
  } as unknown as RunEventsService;

  const eventsBusStub = {
    publishEvent: vi.fn(async () => null),
  } as unknown as EventsBusService;

  const reducer = new CallModelLLMReducer(runEventsStub, eventsBusStub);
  reducer.init({
    llm: { call: llmCallMock } as unknown as LLM,
    model: 'gpt-test',
    systemPrompt: 'system prompt',
    tools: [],
  });
  return reducer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoadLLMReducer response deduplication', () => {
  it('dedupes identical assistant responses before CallModelLLMReducer', async () => {
    const reducer = new LoadLLMReducer(prismaServiceStub);
    const ctx = baseContext();

    const baseOutput = [AIMessage.fromText('assistant reply').toPlain()];

    const persistedMessage = new ResponseMessage({ output: deepClone(baseOutput) });
    const incomingMessage = new ResponseMessage({ output: deepClone(baseOutput) });

    const persistedState: LLMState = { messages: [persistedMessage], context: { messageIds: [], memory: [] } };
    const incomingState: LLMState = { messages: [incomingMessage], context: { messageIds: [], memory: [] } };

    setupPersistedState(reducer, persistedState, ctx);

    const merged = await reducer.invoke(incomingState, ctx);

    expect(merged.messages).toHaveLength(1);
    const responseMessages = merged.messages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
    expect(responseMessages).toHaveLength(1);
    expect(responseMessages[0].toPlain()).toEqual(persistedMessage.toPlain());

    const llmCallMock = vi.fn(async () => ResponseMessage.fromText('ok'));
    const callReducer = callReducerWithMocks(llmCallMock);

    await callReducer.invoke(merged, ctx);

    expect(llmCallMock).toHaveBeenCalledTimes(1);
    const callArgs = llmCallMock.mock.calls[0][0];
    const inputResponses = callArgs.input.filter((msg: unknown): msg is ResponseMessage => msg instanceof ResponseMessage);
    expect(inputResponses).toHaveLength(1);
    expect(inputResponses[0].toPlain()).toEqual(persistedMessage.toPlain());
  });

  it('dedupes assistant responses containing tool calls and empty text', async () => {
    const reducer = new LoadLLMReducer(prismaServiceStub);
    const ctx = baseContext();

    const toolCallPlain = {
      id: 'call-1',
      type: 'function_call',
      call_id: 'call-1',
      name: 'lookup_user',
      arguments: '{"id":42}',
      status: 'completed',
    } satisfies ReturnType<ToolCallMessage['toPlain']>;

    const emptyTextMessage = {
      id: 'msg-tool',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: '',
          annotations: [],
        },
      ],
    } satisfies ReturnType<AIMessage['toPlain']>;

    const baseOutput = [emptyTextMessage, toolCallPlain];

    const persistedMessage = new ResponseMessage({ output: deepClone(baseOutput) });
    const incomingMessage = new ResponseMessage({ output: deepClone(baseOutput) });

    const persistedState: LLMState = { messages: [persistedMessage], context: { messageIds: [], memory: [] } };
    const incomingState: LLMState = { messages: [incomingMessage], context: { messageIds: [], memory: [] } };

    setupPersistedState(reducer, persistedState, ctx);

    const merged = await reducer.invoke(incomingState, ctx);

    const responseMessages = merged.messages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
    expect(responseMessages).toHaveLength(1);

    const llmCallMock = vi.fn(async () => ResponseMessage.fromText('ok'));
    const callReducer = callReducerWithMocks(llmCallMock);

    await callReducer.invoke(merged, ctx);

    expect(llmCallMock).toHaveBeenCalledTimes(1);
    const callArgs = llmCallMock.mock.calls[0][0];
    const inputResponses = callArgs.input.filter((msg: unknown): msg is ResponseMessage => msg instanceof ResponseMessage);
    expect(inputResponses).toHaveLength(1);
    const toolCalls = inputResponses[0].output.filter((msg): msg is ToolCallMessage => msg instanceof ToolCallMessage);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].callId).toBe('call-1');
  });
});

