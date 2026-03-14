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

describe('LoadLLMReducer merge behavior', () => {
  it('concatenates persisted and incoming response messages without deduplication', async () => {
    const reducer = new LoadLLMReducer(prismaServiceStub);
    const ctx = baseContext();

    const persistedMessage = ResponseMessage.fromText('persisted');
    const incomingMessage = ResponseMessage.fromText('incoming');

    const persistedState: LLMState = { messages: [persistedMessage], context: { messageIds: [], memory: [] } };
    const incomingState: LLMState = { messages: [incomingMessage], context: { messageIds: [], memory: [] } };

    setupPersistedState(reducer, persistedState, ctx);

    const merged = await reducer.invoke(incomingState, ctx);

    expect(merged.messages).toHaveLength(2);
    const responseMessages = merged.messages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
    expect(responseMessages).toHaveLength(2);
    expect(responseMessages[0].text).toBe('persisted');
    expect(responseMessages[1].text).toBe('incoming');
  });

  it('keeps tool calls while filtering empty assistant text during LLM input assembly', async () => {
    const reducer = new LoadLLMReducer(prismaServiceStub);
    const ctx = baseContext();

    const toolCallPlain = {
      type: 'function_call',
      call_id: 'call-1',
      name: 'lookup_user',
      arguments: '{"id":42}',
    } as ReturnType<ToolCallMessage['toPlain']>;

    const emptyAssistantPlain = AIMessage.fromText('').toPlain();

    const persistedMessage = new ResponseMessage({ output: [deepClone(emptyAssistantPlain), deepClone(toolCallPlain)] });

    const persistedState: LLMState = { messages: [persistedMessage], context: { messageIds: [], memory: [] } };
    const incomingState: LLMState = { messages: [], context: { messageIds: [], memory: [] } };

    setupPersistedState(reducer, persistedState, ctx);

    const merged = await reducer.invoke(incomingState, ctx);

    const llmCallMock = vi.fn(async ({ input }: Parameters<LLM['call']>[0]) => {
      const flatten = input.flatMap((msg) => {
        if (msg instanceof ResponseMessage) {
          const output = msg.output;
          const includesToolCall = output.some((entry) => entry instanceof ToolCallMessage);
          return output
            .filter((entry) => {
              if (!includesToolCall) return true;
              if (!(entry instanceof AIMessage)) return true;
              return entry.text.trim().length > 0;
            })
            .map((entry) => entry.toPlain());
        }
        return [msg.toPlain()];
      });

      const assistantMessages = flatten.filter((entry: any) => entry?.role === 'assistant');
      const toolCalls = flatten.filter((entry: any) => entry?.type === 'function_call');

      expect(assistantMessages).toHaveLength(0);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({ call_id: 'call-1', name: 'lookup_user', arguments: '{"id":42}' });

      return ResponseMessage.fromText('ok');
    });

    const callReducer = callReducerWithMocks(llmCallMock);

    await callReducer.invoke(merged, ctx);

    expect(llmCallMock).toHaveBeenCalledTimes(1);
  });
});
