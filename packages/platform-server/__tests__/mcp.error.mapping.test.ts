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
