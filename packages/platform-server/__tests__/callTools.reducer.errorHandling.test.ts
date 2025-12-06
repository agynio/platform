import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage, AIMessage, ToolCallOutputMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { z } from 'zod';
import { createRunEventsStub, createEventsBusStub } from './helpers/runEvents.stub';
import { CallAgentTool } from '../src/nodes/tools/call_agent/call_agent.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { Signal } from '../src/signal';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { ShellCommandTool } from '../src/nodes/tools/shell_command/shell_command.tool';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import type { ManageToolNode } from '../src/nodes/tools/manage/manage.node';

const buildState = (name: string, callId: string, args: string) => {
  const response = new ResponseMessage({
    output: [new ToolCallMessage({ type: 'function_call', call_id: callId, name, arguments: args } as any).toPlain() as any] as any,
  });
  return { messages: [response], meta: {}, context: { messageIds: [], memory: [] } } as any;
};

const parseErrorPayload = (result: any) => {
  const last = result.messages.at(-1) as ToolCallOutputMessage;
  expect(last).toBeInstanceOf(ToolCallOutputMessage);
  return JSON.parse(last.text);
};

describe('CallToolsLLMReducer error isolation', () => {
  const ctx = {
    threadId: 'thread-err',
    runId: 'run-err',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { getAgentNodeId: () => 'agent-node' },
  } as any;

  it('returns BAD_JSON_ARGS error without throwing', async () => {
    const tool = {
      name: 'demo',
      description: 'demo tool',
      schema: z.object({}),
      async execute() {
        return 'ok';
      },
    } as any;

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('demo', 'call-json', '{bad'), ctx);

    const payload = parseErrorPayload(result);
    expect(payload.message).toContain('Invalid JSON arguments');
    expect(payload.error_code).toBe('BAD_JSON_ARGS');
    expect(payload.tool_call_id).toBe('call-json');
  });

  it('returns SCHEMA_VALIDATION_FAILED when args fail schema', async () => {
    const tool = {
      name: 'needs-field',
      description: 'requires foo',
      schema: z.object({ foo: z.string() }),
      async execute() {
        return 'ok';
      },
    } as any;

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('needs-field', 'call-schema', JSON.stringify({})), ctx);

    const payload = parseErrorPayload(result);
    expect(payload.message).toContain('Arguments failed validation');
    expect(payload.error_code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(Array.isArray(payload.details)).toBe(true);
  });

  it('returns TOOL_NOT_FOUND when tool is missing', async () => {
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [] });
    const state = buildState('missing-tool', 'call-missing', JSON.stringify({ foo: 'bar' }));
    const result = await reducer.invoke(state, ctx);

    const payload = parseErrorPayload(result);
    expect(payload.message).toContain('Tool missing-tool is not registered');
    expect(payload.error_code).toBe('TOOL_NOT_FOUND');
  });

  it('wraps tool execution error as TOOL_EXECUTION_ERROR', async () => {
    const tool = {
      name: 'failing',
      description: 'throws',
      schema: z.object({}),
      async execute() {
        throw new Error('boom');
      },
    } as any;

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('failing', 'call-fail', JSON.stringify({})), ctx);

    const payload = parseErrorPayload(result);
    expect(payload.message).toContain('execution failed');
    expect(payload.error_code).toBe('TOOL_EXECUTION_ERROR');
    expect(payload.details?.message).toBe('boom');
  });

  it('enforces TOOL_OUTPUT_TOO_LARGE limit', async () => {
    const tool = {
      name: 'bloat',
      description: 'returns huge string',
      schema: z.object({}),
      async execute() {
        return 'x'.repeat(50001);
      },
    } as any;

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('bloat', 'call-big', JSON.stringify({})), ctx);

    const payload = parseErrorPayload(result);
    expect(payload.message).toContain('produced output longer');
    expect(payload.error_code).toBe('TOOL_OUTPUT_TOO_LARGE');
  });

  it('marks non-zero shell_command responses as errors while returning message', async () => {
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

      override async executeStreaming(
        _args: Parameters<ShellCommandTool['executeStreaming']>[0],
        _context: Parameters<ShellCommandTool['executeStreaming']>[1],
        _options: Parameters<ShellCommandTool['executeStreaming']>[2],
      ): Promise<string> {
        return '[exit code 42] compiler error: missing semicolon';
      }
    }

    const shellTool = new StubShellCommandTool();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [shellTool] });
    const state = buildState(shellTool.name, 'call-shell', JSON.stringify({ command: 'fail' }));

    const result = await reducer.invoke(state, ctx);

    const message = result.messages.at(-1) as ToolCallOutputMessage;
    expect(message).toBeInstanceOf(ToolCallOutputMessage);
    expect(message.text).toBe('[exit code 42] compiler error: missing semicolon');

    expect(runEvents.completeToolExecution).toHaveBeenCalledTimes(1);
    const [payload] = runEvents.completeToolExecution.mock.calls[0];
    expect(payload.status).toBe('error');
    expect(payload.errorMessage).toBe('[exit code 42] compiler error: missing semicolon');
  });

  it('invokes manage tool via reducer without relying on instance logger field', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as Partial<AgentsPersistenceService>;

    const workerInvoke = vi.fn().mockResolvedValue(undefined);
    const manageNode = {
      nodeId: 'manage-node-logger',
      config: {},
      listWorkers: vi.fn().mockReturnValue(['Worker One']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn().mockReturnValue(15000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const linking = {
      registerParentToolExecution: vi.fn().mockRejectedValue(new Error('linking offline')),
    };

    const manageTool = new ManageFunctionTool(
      persistence as AgentsPersistenceService,
      linking as unknown as CallAgentLinkingService,
    );
    manageTool.init(manageNode as ManageToolNode);

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [manageTool as any] });

    const warnSpy = vi
      .spyOn((manageTool as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    const ctx = {
      threadId: 'thread-manage',
      runId: 'run-manage',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: {
        getAgentNodeId: () => 'agent-node',
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    const state = buildState(
      manageTool.name,
      'call-manage',
      JSON.stringify({ command: 'send_message', worker: 'Worker One', message: 'hello' }),
    );

    const result = await reducer.invoke(state, ctx);

    const payload = result.messages.at(-1) as ToolCallOutputMessage;
    expect(payload).toBeInstanceOf(ToolCallOutputMessage);
    expect(payload.text).toBe('async acknowledgement');
    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith(
      'manage',
      'worker-one',
      'thread-manage',
      '',
    );
    expect(workerInvoke).toHaveBeenCalledWith('child-thread', expect.any(Array));
    expect(linking.registerParentToolExecution).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to register parent tool execution'));

    warnSpy.mockRestore();
  });
});

describe('CallToolsLLMReducer call_agent metadata', () => {
  it('records child thread metadata and source span for call_agent tool executions', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-id'),
    } as unknown as AgentsPersistenceService;

    const linkingMock = {
      buildInitialMetadata: vi.fn((params: { tool: 'call_agent' | 'call_engineer'; parentThreadId: string; childThreadId: string }) => ({
        tool: params.tool,
        parentThreadId: params.parentThreadId,
        childThreadId: params.childThreadId,
        childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
        childRunId: null,
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childMessageId: null,
      })),
      registerParentToolExecution: vi.fn().mockResolvedValue('evt-123'),
      onChildRunStarted: vi.fn().mockResolvedValue(null),
      onChildRunMessage: vi.fn().mockResolvedValue(null),
      onChildRunCompleted: vi.fn().mockResolvedValue(null),
    };

    const linking = linkingMock as unknown as CallAgentLinkingService;

    const callAgentNode = new CallAgentTool(persistence, linking);
    await callAgentNode.setConfig({ description: 'desc', response: 'sync' });

    const agent = {
      async invoke(_threadId: string) {
        return new ResponseMessage({ output: [AIMessage.fromText('ok').toPlain()] });
      },
    };

    // @ts-expect-error private method access for tests
    callAgentNode['setAgent'](agent);
    const dynamicTool = callAgentNode.getTool();

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [dynamicTool] });

    const state = buildState(dynamicTool.name, 'call-agent-1', JSON.stringify({ input: 'hello', threadAlias: 'child', summary: 'Child summary' }));
    const ctx = {
      threadId: 'parent-thread',
      runId: 'parent-run',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-node' },
    } as any;

    await reducer.invoke(state, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledTimes(1);
    const startArgs = runEvents.startToolExecution.mock.calls[0]?.[0];
    expect(startArgs?.sourceSpanId).toBeUndefined();
    expect(startArgs?.metadata).toBeUndefined();
    expect(linkingMock.registerParentToolExecution).toHaveBeenCalledWith({
      runId: 'parent-run',
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-id',
      toolName: dynamicTool.name,
    });
  });
});
