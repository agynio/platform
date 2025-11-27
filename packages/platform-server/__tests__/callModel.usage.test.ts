import { describe, expect, it, vi } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { AIMessage, HumanMessage, ResponseMessage, SystemMessage } from '@agyn/llm';
import { Signal } from '../src/signal';

describe('CallModelLLMReducer usage metrics', () => {
  it('passes usage metrics to completeLLMCall', async () => {
    const runEvents = {
      startLLMCall: vi.fn(async () => ({ id: 'evt-usage-1' })),
      publishEvent: vi.fn(async () => {}),
      completeLLMCall: vi.fn(async () => {}),
      createContextItems: vi.fn(async () => ['ctx-assistant']),
      connectContextItemsToRun: vi.fn(async () => {}),
      createContextItemsAndConnect: vi.fn(async () => ({ messageIds: [] })),
    };

    const usage = {
      input_tokens: 256,
      input_tokens_details: { cached_tokens: 64 },
      output_tokens: 128,
      output_tokens_details: { reasoning_tokens: 12 },
      total_tokens: 384,
    } as const;

    const response = new ResponseMessage({
      output: [AIMessage.fromText('Usage response').toPlain()],
      usage,
    });

    const llm = { call: vi.fn(async () => response) };

    const eventsBus = { publishEvent: vi.fn(async () => {}), subscribeToRunEvents: vi.fn(() => vi.fn()) };
    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-usage',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [SystemMessage.fromText('SYS'), HumanMessage.fromText('Hello')],
      context: { messageIds: ['ctx-1'], memory: [] },
    } as any;

    await reducer.invoke(initialState, {
      threadId: 'thread-usage',
      runId: 'run-usage',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-usage' } as any,
    });

    expect(runEvents.completeLLMCall).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: {
          inputTokens: 256,
          cachedInputTokens: 64,
          outputTokens: 128,
          reasoningTokens: 12,
          totalTokens: 384,
        },
      }),
    );
  });

  it('passes new context item count to startLLMCall args', async () => {
    const runEvents = {
      startLLMCall: vi.fn(async () => ({ id: 'evt-context-1' })),
      publishEvent: vi.fn(async () => {}),
      completeLLMCall: vi.fn(async () => {}),
      createContextItems: vi.fn().mockResolvedValueOnce(['ctx-user-new']).mockResolvedValueOnce(['ctx-assistant']),
      connectContextItemsToRun: vi.fn(async () => {}),
      createContextItemsAndConnect: vi.fn(async () => ({ messageIds: [] })),
    };

    const response = new ResponseMessage({ output: [] as any, text: 'ok' } as any);
    const llm = { call: vi.fn(async () => response) };

    const eventsBus = { publishEvent: vi.fn(async () => {}), subscribeToRunEvents: vi.fn(() => vi.fn()) };
    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-context',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [HumanMessage.fromText('Hello there')],
      context: { messageIds: [], memory: [], system: { id: 'ctx-system-1' } },
    } as any;

    await reducer.invoke(initialState, {
      threadId: 'thread-context',
      runId: 'run-context',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-context' } as any,
    });

    expect(runEvents.startLLMCall).toHaveBeenCalledWith(
      expect.objectContaining({
        newContextItemCount: 1,
        contextItemIds: expect.arrayContaining(['ctx-system-1', 'ctx-user-new']),
      }),
    );
  });

  it('ignores summary and memory additions when counting new context items', async () => {
    const runEvents = {
      startLLMCall: vi.fn(async () => ({ id: 'evt-context-2' })),
      publishEvent: vi.fn(async () => {}),
      completeLLMCall: vi.fn(async () => {}),
      createContextItems: vi
        .fn()
        .mockResolvedValueOnce(['ctx-summary-new', 'ctx-memory-new', 'ctx-user-tail'])
        .mockResolvedValueOnce(['ctx-assistant-latest']),
      connectContextItemsToRun: vi.fn(async () => {}),
      createContextItemsAndConnect: vi.fn(async () => ({ messageIds: [] })),
    };

    const response = new ResponseMessage({ output: [] as any, text: 'tail ok' } as any);
    const llm = { call: vi.fn(async () => response) };

    const memoryProvider = vi.fn(async () => ({
      msg: SystemMessage.fromText('Memory injection'),
      place: 'after_system' as const,
    }));

    const eventsBus = { publishEvent: vi.fn(async () => {}), subscribeToRunEvents: vi.fn(() => vi.fn()) };
    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'gpt-context-tail',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider,
    });

    const initialState = {
      summary: 'Fresh summary context',
      messages: [HumanMessage.fromText('Prior prompt'), HumanMessage.fromText('Newest prompt')],
      context: {
        messageIds: ['ctx-convo-existing'],
        memory: [],
        system: { id: 'ctx-system-1' },
        summary: { id: 'ctx-summary-old', text: 'Stale summary' },
      },
    } as any;

    await reducer.invoke(initialState, {
      threadId: 'thread-context-tail',
      runId: 'run-context-tail',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-context-tail' } as any,
    });

    expect(runEvents.startLLMCall).toHaveBeenCalledWith(
      expect.objectContaining({
        newContextItemCount: 1,
        contextItemIds: expect.arrayContaining(['ctx-summary-new', 'ctx-memory-new', 'ctx-user-tail']),
      }),
    );
  });
});
