import { describe, it, expect, vi } from 'vitest';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { Signal } from '../src/signal';
import { HumanMessage, ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { createRunEventsStub } from './helpers/runEvents.stub';

describe('CallToolsLLMReducer termination handling', () => {
  it('skips execution when terminateSignal already active', async () => {
    const runEvents = createRunEventsStub();
    const tool = {
      name: 'noop',
      description: 'noop',
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => 'ok'),
    };

    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [tool] as any });

    const call = new ToolCallMessage({ type: 'function_call', call_id: 'call-1', name: 'noop', arguments: '{}' } as any);
    const response = new ResponseMessage({ output: [call.toPlain() as any] as any });
    const state = { messages: [HumanMessage.fromText('start'), response], meta: {}, context: { messageIds: [], memory: [] } } as any;

    const terminateSignal = new Signal();
    terminateSignal.activate();

    const result = await reducer.invoke(state, {
      threadId: 'thread',
      runId: 'run',
      finishSignal: new Signal(),
      terminateSignal,
      callerAgent: { getAgentNodeId: () => 'agent' } as any,
    });

    expect(result).toBe(state);
    expect(tool.execute).not.toHaveBeenCalled();
    expect(runEvents.createContextItems).not.toHaveBeenCalled();
  });

  it('does not persist outputs when terminateSignal activates during execution', async () => {
    const runEvents = createRunEventsStub();
    const terminateSignal = new Signal();
    const tool = {
      name: 'slow-tool',
      description: 'slow',
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => {
        terminateSignal.activate();
        return 'done';
      }),
    };

    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [tool] as any });
    const call = new ToolCallMessage({ type: 'function_call', call_id: 'call-slow', name: 'slow-tool', arguments: '{}' } as any);
    const response = new ResponseMessage({ output: [call.toPlain() as any] as any });
    const state = { messages: [HumanMessage.fromText('start'), response], meta: {}, context: { messageIds: [], memory: [] } } as any;

    const result = await reducer.invoke(state, {
      threadId: 'thread',
      runId: 'run',
      finishSignal: new Signal(),
      terminateSignal,
      callerAgent: { getAgentNodeId: () => 'agent' } as any,
    });

    expect(result).toBe(state);
    expect(runEvents.createContextItems).not.toHaveBeenCalled();
  });
});
