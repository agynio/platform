import { describe, expect, it, vi } from 'vitest';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { AIMessage, HumanMessage, ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';

describe('CallModelLLMReducer ingress sanitization', () => {
  it('strips NUL bytes from response text and tool call arguments', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();

    const toolCall = new ToolCallMessage({
      type: 'function_call',
      call_id: 'call-shell',
      name: 'shell_command',
      arguments: JSON.stringify({
        target: '/tmp/next-dev.log',
        chunk: 'alpha\u0000beta',
        nested: { tail: 'line\u0000one' },
      }),
    } as any);

    const aiMessage = AIMessage.fromText('final\u0000text with tail');
    const response = new ResponseMessage({ output: [aiMessage.toPlain(), toolCall.toPlain() as any] } as any);
    const llm = { call: vi.fn(async () => response) };

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'test-model',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [HumanMessage.fromText('Hello')],
      context: { messageIds: [], memory: [], pendingNewContextItemIds: [] },
    } as any;

    const result = await reducer.invoke(initialState, {
      threadId: 'thread-null',
      runId: 'run-null',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-null' } as any,
    });

    const completePayload = (runEvents.completeLLMCall as any).mock.calls[0][0];
    expect(completePayload.responseText).toBe('finaltext with tail');
    expect(JSON.stringify(completePayload.toolCalls[0].arguments)).not.toContain('\u0000');
    expect((completePayload.toolCalls[0].arguments as Record<string, any>).chunk).toBe('alphabeta');
    expect((completePayload.toolCalls[0].arguments as Record<string, any>).nested.tail).toBe('lineone');

    const latestMessage = result.messages[result.messages.length - 1];
    expect(latestMessage).toBeInstanceOf(ResponseMessage);
    expect((latestMessage as ResponseMessage).text).toBe('finaltext with tail');
  });

  it('sanitizes fallback arguments payload when JSON parse fails', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();

    const toolCall = new ToolCallMessage({
      type: 'function_call',
      call_id: 'call-shell-raw',
      name: 'shell_command',
      arguments: '{broken:\u0000payload',
    } as any);

    const aiMessage = AIMessage.fromText('ok');
    const response = new ResponseMessage({ output: [aiMessage.toPlain(), toolCall.toPlain() as any] } as any);
    const llm = { call: vi.fn(async () => response) };

    const reducer = new CallModelLLMReducer(runEvents as any, eventsBus as any).init({
      llm: llm as any,
      model: 'test-model',
      systemPrompt: 'SYS',
      tools: [],
    });

    const initialState = {
      messages: [HumanMessage.fromText('Hello again')],
      context: { messageIds: [], memory: [], pendingNewContextItemIds: [] },
    } as any;

    await reducer.invoke(initialState, {
      threadId: 'thread-fallback',
      runId: 'run-fallback',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-fallback' } as any,
    });

    const completePayload = (runEvents.completeLLMCall as any).mock.calls[0][0];
    expect(completePayload.toolCalls[0].arguments).toMatchObject({ raw: '{broken:payload' });
    expect(JSON.stringify(completePayload.toolCalls[0].arguments)).not.toContain('\u0000');
  });
});
