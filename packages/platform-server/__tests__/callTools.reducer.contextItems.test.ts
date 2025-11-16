import { describe, it, expect, vi } from 'vitest';
import { HumanMessage, ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';

vi.mock('@agyn/tracing', async () => {
  const actual = await vi.importActual<typeof import('@agyn/tracing')>('@agyn/tracing');
  const ToolCallResponse = actual.ToolCallResponse;

  const withToolCall = async (_attrs: unknown, fn: () => Promise<unknown> | unknown): Promise<unknown> => {
    const res = await fn();
    return res instanceof ToolCallResponse ? res.raw : res;
  };

  const withLLM = async (_attrs: unknown, fn: () => Promise<unknown> | unknown): Promise<unknown> => {
    const res = await fn();
    if (res instanceof actual.LLMResponse) {
      return res.raw;
    }
    return res;
  };

  const loggerImpl = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  const logger = () => loggerImpl;

  return {
    ...actual,
    withToolCall,
    withLLM,
    logger,
  } as const;
});

type MockFn = ReturnType<typeof vi.fn>;

describe('CallToolsLLMReducer context items', () => {
  it('persists tool outputs after existing assistant response context', async () => {
    const runEvents = createRunEventsStub();
    const createContextItemsMock = runEvents.createContextItems as unknown as MockFn;
    const executionSnapshots: Array<{ name: string; callCount: number; input: unknown }> = [];

    const buildTool = (name: string) => ({
      name,
      description: `${name} tool`,
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async (input: unknown) => {
        executionSnapshots.push({ name, callCount: createContextItemsMock.mock.calls.length, input });
        await Promise.resolve();
        return `${name}-result`;
      }),
    });

    const tools = [buildTool('alpha'), buildTool('beta')];
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools });

    const toolCalls = [
      new ToolCallMessage({ type: 'function_call', call_id: 'call-alpha', name: 'alpha', arguments: JSON.stringify({ foo: 1 }) } as any),
      new ToolCallMessage({ type: 'function_call', call_id: 'call-beta', name: 'beta', arguments: JSON.stringify({ bar: 2 }) } as any),
    ];

    const response = new ResponseMessage({ output: toolCalls.map((call) => call.toPlain() as any) as any });
    const initialState = {
      messages: [HumanMessage.fromText('hello'), response],
      meta: {},
      context: { messageIds: ['existing-1', 'assistant-existing'], memory: [] },
    } as any;
    const ctx = { threadId: 'thread-1', runId: 'run-1', callerAgent: { getAgentNodeId: () => 'agent-node' } } as any;

    const result = await reducer.invoke(initialState, ctx);

    expect(createContextItemsMock).toHaveBeenCalledTimes(1);
    const [resultItems] = createContextItemsMock.mock.calls.map(([items]) => items as any[]);

    expect(resultItems).toHaveLength(2);
    expect(resultItems.map((item) => item.contentText)).toEqual(['alpha-result', 'beta-result']);

    expect(executionSnapshots).toHaveLength(2);
    executionSnapshots.forEach((snapshot) => {
      expect(snapshot.callCount).toBe(0);
    });
    expect(executionSnapshots.find((s) => s.name === 'alpha')?.input).toEqual({ foo: 1 });
    expect(executionSnapshots.find((s) => s.name === 'beta')?.input).toEqual({ bar: 2 });

    const resultIds = await (createContextItemsMock.mock.results[0]?.value as Promise<string[]>);
    expect(result.context.messageIds).toEqual(['existing-1', 'assistant-existing', ...resultIds]);

    const appendedMessages = result.messages.slice(-2);
    expect(appendedMessages[0].text).toBe('alpha-result');
    expect(appendedMessages[1].text).toBe('beta-result');
  });

  it('persists tool output context even when execution fails', async () => {
    const runEvents = createRunEventsStub();
    const createContextItemsMock = runEvents.createContextItems as unknown as MockFn;

    const failingTool = {
      name: 'failing',
      description: 'fails',
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [failingTool] });
    const call = new ToolCallMessage({ type: 'function_call', call_id: 'call-fail', name: 'failing', arguments: JSON.stringify({ ok: true }) } as any);
    const response = new ResponseMessage({ output: [call.toPlain() as any] as any });
    const state = {
      messages: [HumanMessage.fromText('hi'), response],
      meta: {},
      context: { messageIds: ['existing-ctx', 'assistant-ctx'], memory: [] },
    } as any;
    const ctx = { threadId: 'thread', runId: 'run', callerAgent: { getAgentNodeId: () => 'node' } } as any;

    const result = await reducer.invoke(state, ctx);

    expect(createContextItemsMock).toHaveBeenCalledTimes(1);
    const [resultItems] = createContextItemsMock.mock.calls.map(([items]) => items as any[]);

    expect(resultItems).toHaveLength(1);
    expect(resultItems[0].contentText).toContain('Tool failing execution failed');
    const resultIds = await (createContextItemsMock.mock.results[0]?.value as Promise<string[]>);
    expect(result.context.messageIds).toEqual(['existing-ctx', 'assistant-ctx', ...resultIds]);
    expect(result.messages.at(-1)?.text).toContain('Tool failing execution failed');
  });

  it('aligns context ordering for grouped responses with tool output results', async () => {
    const runEvents = createRunEventsStub();
    const createContextItemsMock = runEvents.createContextItems as unknown as MockFn;
    const startLLMCallMock = runEvents.startLLMCall as unknown as MockFn;

    const tool = {
      name: 'alpha',
      description: 'Alpha tool',
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => 'alpha-output'),
    };

    const toolCall = new ToolCallMessage({
      type: 'function_call',
      call_id: 'call-alpha',
      name: 'alpha',
      arguments: JSON.stringify({ foo: 'bar' }),
    } as any);

    const reasoningItem = {
      type: 'reasoning',
      summary: [{ type: 'text', text: 'thinking' }],
      reasoning: [],
    };

    const responseWithTool = new ResponseMessage({ output: [reasoningItem as any, toolCall.toPlain() as any] as any });
    const llmCall = vi
      .fn()
      .mockResolvedValueOnce(responseWithTool)
      .mockResolvedValue(ResponseMessage.fromText('done'));

    const callModel = new CallModelLLMReducer(new LoggerService(), runEvents as any).init({
      llm: { call: llmCall } as any,
      model: 'gpt-test',
      systemPrompt: 'Stay on task',
      tools: [tool as any],
    });

    const callTools = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [tool] as any });

    const ctx = {
      threadId: 'thread-ctx',
      runId: 'run-ctx',
      finishSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-node' },
    } as any;

    const initialState = {
      messages: [HumanMessage.fromText('what is the plan?')],
      meta: {},
      context: { messageIds: ['ctx-user-1'], memory: [], system: { id: 'ctx-system-1' } },
    } as any;

    const afterFirstModel = await callModel.invoke(initialState, ctx);
    expect(startLLMCallMock).toHaveBeenCalledTimes(1);
    expect(startLLMCallMock.mock.calls[0][0]?.contextItemIds).toEqual(['ctx-system-1', 'ctx-user-1']);
    expect(afterFirstModel.messages).toHaveLength(2);
    const lastMessage = afterFirstModel.messages.at(-1);
    expect(lastMessage).toBeInstanceOf(ResponseMessage);
    const responseMessage = lastMessage as ResponseMessage;
    expect(responseMessage.output.some((entry) => entry instanceof ToolCallMessage)).toBe(true);
    expect(createContextItemsMock).toHaveBeenCalledTimes(1);
    const firstAssistantIds = await (createContextItemsMock.mock.results[0]?.value as Promise<string[]>);
    expect(firstAssistantIds).toHaveLength(1);
    const firstAssistantId = firstAssistantIds[0];
    expect(afterFirstModel.context.messageIds).toEqual(['ctx-user-1', firstAssistantId]);
    const firstAssistantItem = createContextItemsMock.mock.calls[0][0][0] as any;
    expect(firstAssistantItem.role).toBe('assistant');
    expect(firstAssistantItem.contentText).toBeNull();
    expect(Array.isArray(firstAssistantItem.contentJson?.output)).toBe(true);
    expect(firstAssistantItem.contentJson.output).toHaveLength(2);
    const [reasoning, toolEntry] = firstAssistantItem.contentJson.output;
    expect(reasoning.type).toBe('reasoning');
    expect(toolEntry.type).toBe('function_call');
    expect(toolEntry.name).toBe('alpha');

    const afterTools = await callTools.invoke(afterFirstModel, ctx);
    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(createContextItemsMock).toHaveBeenCalledTimes(2);
    const toolContextIds = await (createContextItemsMock.mock.results[1]?.value as Promise<string[]>);
    expect(toolContextIds).toHaveLength(1);
    expect(afterTools.context.messageIds).toEqual(['ctx-user-1', firstAssistantId, toolContextIds[0]]);

    const afterSecondModel = await callModel.invoke(afterTools, ctx);

    expect(startLLMCallMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = startLLMCallMock.mock.calls[1][0];
    expect(Array.isArray(secondCallArgs?.contextItemIds)).toBe(true);

    expect(createContextItemsMock).toHaveBeenCalledTimes(3);
    const secondAssistantIds = await (createContextItemsMock.mock.results[2]?.value as Promise<string[]>);
    expect(secondAssistantIds).toHaveLength(1);
    const secondAssistantId = secondAssistantIds[0];

    expect(secondCallArgs.contextItemIds).toEqual(['ctx-system-1', 'ctx-user-1', firstAssistantId, toolContextIds[0]]);
    expect(afterSecondModel.context.messageIds).toEqual(['ctx-user-1', firstAssistantId, toolContextIds[0], secondAssistantId]);

    const secondAssistantItem = createContextItemsMock.mock.calls[2][0][0] as any;
    expect(secondAssistantItem.role).toBe('assistant');
    expect(secondAssistantItem.contentText).toBe('done');
    expect(Array.isArray(secondAssistantItem.contentJson?.output)).toBe(true);
  });
});
