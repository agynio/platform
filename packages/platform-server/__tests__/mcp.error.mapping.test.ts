import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import z from 'zod';
import { Signal } from '../src/signal';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { createRunEventsStub, createEventsBusStub } from './helpers/runEvents.stub';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import type { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import type { LLMState } from '../src/llm/types';

const buildState = (toolName: string, callId: string, args: string): LLMState => {
  const toolCall = new ToolCallMessage({ type: 'function_call', name: toolName, call_id: callId, arguments: args } as any);
  const response = new ResponseMessage({ output: [toolCall.toPlain() as any] } as any);
  return {
    messages: [response],
    meta: { lastLLMEventId: `evt-${callId}` },
    context: { messageIds: [], memory: [] },
  } as unknown as LLMState;
};

const createContext = () => ({
  threadId: 'thread-mcp',
  runId: 'run-mcp',
  finishSignal: new Signal(),
  terminateSignal: new Signal(),
  callerAgent: { getAgentNodeId: () => 'agent-node' },
});

const createNode = (callTool: ReturnType<typeof vi.fn>) =>
  ({
    config: { namespace: 'demo' },
    callTool,
  }) as unknown as LocalMCPServerNode;

describe('CallToolsLLMReducer MCP error mapping', () => {
  it('marks MCP tool failures as error events and publishes updates', async () => {
    const callTool = vi.fn(async () => ({
      isError: true,
      structuredContent: { message: 'apply_patch failed', code: 'PATCH_FAIL', retriable: false },
    }));
    const node = createNode(callTool);
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Codex patch', z.object({}), node);

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();

    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const state = buildState(tool.name, 'call-err', JSON.stringify({}));
    const ctx = createContext();

    const result = await reducer.invoke(state, ctx as any);

    expect(callTool).toHaveBeenCalledTimes(1);

    expect(runEvents.startToolExecution).toHaveBeenCalledTimes(1);
    expect(eventsBus.publishEvent).toHaveBeenCalledTimes(2);
    expect(eventsBus.publishEvent.mock.calls[0][1]).toBe('append');
    expect(eventsBus.publishEvent.mock.calls[1][1]).toBe('update');

    expect(runEvents.completeToolExecution).toHaveBeenCalledTimes(1);
    const [completionPayload] = runEvents.completeToolExecution.mock.calls[0];
    expect(completionPayload.status).toBe('error');
    expect(completionPayload.errorMessage).toContain('apply_patch failed (code=PATCH_FAIL retriable=false)');
    expect(completionPayload.errorCode).toBe('MCP_CALL_ERROR');

    const lastMessage = result.messages.at(-1) as ToolCallOutputMessage;
    expect(lastMessage).toBeInstanceOf(ToolCallOutputMessage);
    const payload = JSON.parse(lastMessage.text);
    expect(payload.status).toBe('error');
    expect(payload.error_code).toBe('MCP_CALL_ERROR');
    expect(payload.message).toContain(
      `Tool ${tool.name} execution failed: apply_patch failed (code=PATCH_FAIL retriable=false)`,
    );
  });
});

describe('CallToolsLLMReducer MCP payload handling (protocol-only)', () => {
  const invokeWithPayload = async (payload: Record<string, unknown>) => {
    const callTool = vi.fn(async () => ({ isError: false, content: JSON.stringify(payload) }));
    const node = createNode(callTool);
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Codex patch', z.object({}), node);
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const state = buildState(tool.name, `call-${Math.random().toString(36).slice(2, 6)}`, JSON.stringify({}));
    const ctx = createContext();
    const result = await reducer.invoke(state, ctx as any);
    const completion = runEvents.completeToolExecution.mock.calls[0]?.[0];
    return { result, completion };
  };

  it('treats HTTP-looking payloads as success when isError is false', async () => {
    const { result, completion } = await invokeWithPayload({ status: 401, error: 'Search failed' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
    expect(completion.errorMessage).toBeNull();

    const last = result.messages.at(-1) as ToolCallOutputMessage;
    expect(last).toBeInstanceOf(ToolCallOutputMessage);
    expect(last.text).toContain('Search failed');
  });

  it('does not infer failures from statusCode when isError is false', async () => {
    const { completion } = await invokeWithPayload({ statusCode: 403, message: 'Forbidden' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
    expect(completion.errorMessage).toBeNull();
  });

  it('does not treat string status with numeric statusCode as failure without isError', async () => {
    const { completion } = await invokeWithPayload({ status: 'error', statusCode: 500, message: 'Internal error' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
    expect(completion.errorMessage).toBeNull();
  });

  it('still returns success for payloads without status metadata', async () => {
    const { result, completion } = await invokeWithPayload({ error: 'domain data' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
    expect(completion.errorMessage).toBeNull();

    const last = result.messages.at(-1) as ToolCallOutputMessage;
    expect(last.text).toContain('domain data');
  });

  it('keeps success for payloads with non-error status codes', async () => {
    const { completion } = await invokeWithPayload({ status: 200, error: 'none' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
  });

  it('treats non-numeric status strings as success without isError flags', async () => {
    const { completion } = await invokeWithPayload({ status: 'error', error: 'Bad' });
    expect(completion.status).toBe('success');
    expect(completion.errorCode ?? null).toBeNull();
  });
});
