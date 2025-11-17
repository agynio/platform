import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage, AIMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { z } from 'zod';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { CallAgentTool } from '../src/nodes/tools/call_agent/call_agent.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { Signal } from '../src/signal';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

type Captured = {
  attrs: { toolCallId: string; name: string; input: unknown };
  response: { raw: unknown; output?: unknown; status: 'success' | 'error' };
};

vi.mock('@agyn/tracing', () => {
  const captured: Captured[] = [];

  class ToolCallResponse<TRaw = unknown, TOutput = unknown> {
    raw: TRaw;
    output?: TOutput;
    status: 'success' | 'error';
    constructor(params: { raw: TRaw; output?: TOutput; status: 'success' | 'error' }) {
      this.raw = params.raw;
      this.output = params.output;
      this.status = params.status;
    }
  }

  const withToolCall = async (attrs: Captured['attrs'], fn: () => Promise<ToolCallResponse> | ToolCallResponse) => {
    const res = await fn();
    captured.push({ attrs, response: res });
    return res.raw;
  };

  const loggerImpl = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const logger = () => loggerImpl;

  return { withToolCall, ToolCallResponse, logger, __test: { captured } } as any;
});

const getCaptured = async (): Promise<Captured[]> => {
  const tracing = await import('@agyn/tracing');
  return ((tracing as any).__test.captured ?? []) as Captured[];
};

const buildState = (name: string, callId: string, args: string) => {
  const response = new ResponseMessage({
    output: [new ToolCallMessage({ type: 'function_call', call_id: callId, name, arguments: args } as any).toPlain() as any] as any,
  });
  return { messages: [response], meta: {}, context: { messageIds: [], memory: [] } } as any;
};

describe('CallToolsLLMReducer error isolation', () => {
  beforeEach(async () => {
    const current = await getCaptured();
    current.length = 0;
  });

  const ctx = { callerAgent: { getAgentNodeId: () => 'agent-node' } } as any;

  it('returns BAD_JSON_ARGS error without throwing', async () => {
    const tool = {
      name: 'demo',
      description: 'demo tool',
      schema: z.object({}),
      async execute() {
        return 'ok';
      },
    } as any;

    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('demo', 'call-json', '{bad'), ctx);

    const last = result.messages.at(-1) as any;
    const captured = await getCaptured();
    expect(last?.text).toContain('Invalid JSON arguments');
    expect(captured[0].response.status).toBe('error');
    expect((captured[0].response.output as any).error_code).toBe('BAD_JSON_ARGS');
    expect((captured[0].response.output as any).tool_call_id).toBe('call-json');
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

    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('needs-field', 'call-schema', JSON.stringify({})), ctx);

    const last = result.messages.at(-1) as any;
    const captured = await getCaptured();
    expect(last?.text).toContain('Arguments failed validation');
    expect((captured[0].response.output as any).error_code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(Array.isArray((captured[0].response.output as any).details)).toBe(true);
  });

  it('returns TOOL_NOT_FOUND when tool is missing', async () => {
    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [] });
    const state = buildState('missing-tool', 'call-missing', JSON.stringify({ foo: 'bar' }));
    const result = await reducer.invoke(state, ctx);

    const last = result.messages.at(-1) as any;
    const captured = await getCaptured();
    expect(last?.text).toContain('Tool missing-tool is not registered');
    expect((captured[0].response.output as any).error_code).toBe('TOOL_NOT_FOUND');
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

    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('failing', 'call-fail', JSON.stringify({})), ctx);

    const last = result.messages.at(-1) as any;
    const captured = await getCaptured();
    expect(last?.text).toContain('execution failed');
    expect((captured[0].response.output as any).error_code).toBe('TOOL_EXECUTION_ERROR');
    expect((captured[0].response.output as any).details?.message).toBe('boom');
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

    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [tool] });
    const result = await reducer.invoke(buildState('bloat', 'call-big', JSON.stringify({})), ctx);

    const last = result.messages.at(-1) as any;
    const captured = await getCaptured();
    expect(last?.text).toContain('produced output longer');
    expect((captured[0].response.output as any).error_code).toBe('TOOL_OUTPUT_TOO_LARGE');
  });
});

describe('CallToolsLLMReducer call_agent metadata', () => {
  it('records child thread metadata and source span for call_agent tool executions', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-id'),
    } as unknown as AgentsPersistenceService;

    const linkingMock = {
      buildInitialMetadata: vi.fn((params: { toolName: string; parentThreadId: string; childThreadId: string }) => ({
        tool: params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent',
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

    const callAgentNode = new CallAgentTool(new LoggerService(), persistence, linking);
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
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [dynamicTool] });

    const state = buildState(dynamicTool.name, 'call-agent-1', JSON.stringify({ input: 'hello', threadAlias: 'child', summary: 'Child summary' }));
    const ctx = {
      threadId: 'parent-thread',
      runId: 'parent-run',
      finishSignal: new Signal(),
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
