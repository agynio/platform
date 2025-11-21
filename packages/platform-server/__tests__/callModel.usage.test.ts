import { describe, expect, it, vi } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
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

    const reducer = new CallModelLLMReducer(new LoggerService(), runEvents as any).init({
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
});
