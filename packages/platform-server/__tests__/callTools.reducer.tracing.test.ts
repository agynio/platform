import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';
import z from 'zod';
import { McpError } from '../src/nodes/mcp/types';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import type { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { ShellCommandTool } from '../src/nodes/tools/shell_command/shell_command.tool';

const buildState = (toolName: string, callId: string, args: string) => {
  const call = new ToolCallMessage({ type: 'function_call', name: toolName, call_id: callId, arguments: args } as any);
  const response = new ResponseMessage({ output: [call.toPlain() as any] } as any);
  return {
    messages: [response],
    meta: { lastLLMEventId: `evt-${callId}` },
    context: { messageIds: [], memory: [] },
  } as any;
};

const createCtx = () => ({
  threadId: 'thread-span',
  runId: 'run-span',
  finishSignal: new Signal(),
  terminateSignal: new Signal(),
  callerAgent: { getAgentNodeId: () => 'agent-node' },
});

const createMcpNode = (callTool: ReturnType<typeof vi.fn>) =>
  ({
    config: { namespace: 'demo' },
    callTool,
  }) as unknown as LocalMCPServerNode;

describe('CallToolsLLMReducer tracing via run events', () => {
  it('marks MCP exceptions as failed tool executions', async () => {
    const callTool = vi.fn(async () => {
      throw new McpError('upstream failure', { code: 'BAD_INPUT' });
    });
    const node = createMcpNode(callTool);
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Patch tool', z.object({}), node);

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const ctx = createCtx();
    const state = buildState(tool.name, 'call-mcp-throw', JSON.stringify({}));

    await reducer.invoke(state, ctx as any);

    expect(runEvents.completeToolExecution).toHaveBeenCalledTimes(1);
    const [completion] = runEvents.completeToolExecution.mock.calls[0];
    expect(completion.status).toBe('error');
    expect(String(completion.errorMessage ?? '')).toContain('upstream failure');
    expect(completion.errorCode).toBe('MCP_CALL_ERROR');
  });

  it('does not reclassify MCP payloads without isError flags', async () => {
    const payload = JSON.stringify({ status: 500, error: 'Search failed' });
    const callTool = vi.fn(async () => ({ isError: false, content: payload }));
    const node = createMcpNode(callTool);
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Patch tool', z.object({}), node);

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const ctx = createCtx();
    const state = buildState(tool.name, 'call-mcp-logical', JSON.stringify({}));

    const result = await reducer.invoke(state, ctx as any);
    const output = result.messages.at(-1) as ToolCallOutputMessage;
    expect(output).toBeInstanceOf(ToolCallOutputMessage);
    expect(output.text).toContain('Search failed');

    expect(runEvents.completeToolExecution).toHaveBeenCalledTimes(1);
    const [completion] = runEvents.completeToolExecution.mock.calls[0];
    expect(completion.status).toBe('success');
    expect(completion.errorMessage).toBeNull();
    expect(completion.errorCode ?? null).toBeNull();
  });

  it('keeps shell command tracing flagged on non-zero exit codes', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const archiveStub = { createSingleFileTar: vi.fn(async () => Buffer.from('')) };
    const prismaStub = {
      getClient: vi.fn(() => ({
        container: { findUnique: vi.fn(async () => null) },
        containerEvent: { findFirst: vi.fn(async () => null) },
      })),
    };

    class StubShellCommandTool extends ShellCommandTool {
      constructor() {
        super(archiveStub as any, runEvents as any, eventsBus as any, prismaStub as any);
      }

      override async executeStreaming(): Promise<string> {
        return '[exit code 2] compiler failure';
      }
    }

    const tool = new StubShellCommandTool();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const ctx = createCtx();
    const state = buildState(tool.name, 'call-shell-span', JSON.stringify({ command: 'fail' }));

    const result = await reducer.invoke(state, ctx as any);
    const message = result.messages.at(-1) as ToolCallOutputMessage;
    expect(message.text).toContain('exit code 2');

    expect(runEvents.completeToolExecution).toHaveBeenCalledTimes(1);
    const [completion] = runEvents.completeToolExecution.mock.calls[0];
    expect(completion.status).toBe('error');
    expect(String(completion.errorMessage ?? '')).toContain('exit code 2');
    expect(completion.errorCode ?? null).toBeNull();
  });
});
