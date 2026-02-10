import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';
import z from 'zod';
import { McpError } from '../src/nodes/mcp/types';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import type { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { ShellCommandTool } from '../src/nodes/tools/shell_command/shell_command.tool';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

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

describe('CallToolsLLMReducer tracing instrumentation', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let contextManager: AsyncLocalStorageContextManager | undefined;

  const runWithSpan = async (fn: () => Promise<unknown>): Promise<ReadableSpan[]> => {
    const tracer = provider.getTracer('call-tools-tracing');
    const span = tracer.startSpan('tool-execution');
    await context.with(trace.setSpan(context.active(), span), async () => {
      await fn();
    });
    span.end();
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    exporter.reset();
    return spans;
  };

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    context.disable();
    contextManager?.disable();
  });

  it('records MCP exceptions as error spans with metadata', async () => {
    const tool = {
      name: 'mcp_demo',
      description: 'demo tool',
      schema: z.object({}),
      async execute() {
        throw new McpError('upstream failure', { code: 'BAD_INPUT' });
      },
    };

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const ctx = createCtx();
    const state = buildState(tool.name, 'call-mcp-throw', JSON.stringify({}));

    const spans = await runWithSpan(() => reducer.invoke(state, ctx as any));
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['tool.name']).toBe(tool.name);
    expect(span.attributes['tool.call_id']).toBe('call-mcp-throw');
    expect(span.attributes['tool.source']).toBe('mcp');
    expect(span.attributes['error.type']).toBe('McpError');
    expect(span.attributes['error.message']).toContain('upstream failure');
    expect(span.attributes['mcp.error_code']).toBe('BAD_INPUT');
    expect(span.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('marks MCP logical failures as error spans with tool error metadata', async () => {
    const largeOutput = 'x'.repeat(60000);
    const callTool = vi.fn(async () => ({ isError: false, content: largeOutput }));
    const node = createMcpNode(callTool);
    const tool = new LocalMCPServerTool('codex_apply_patch', 'Patch tool', z.object({}), node);

    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    const reducer = new CallToolsLLMReducer(runEvents as any, eventsBus as any).init({ tools: [tool as any] });
    const ctx = createCtx();
    const state = buildState(tool.name, 'call-mcp-logical', JSON.stringify({}));

    const spans = await runWithSpan(() => reducer.invoke(state, ctx as any));
    const span = spans[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['tool.name']).toBe(tool.name);
    expect(span.attributes['tool.source']).toBe('mcp');
    expect(span.attributes['tool.error_code']).toBe('TOOL_OUTPUT_TOO_LARGE');
    expect(span.attributes['tool.retriable']).toBe(false);
    const errorEvent = span.events.find((event) => event.name === 'tool.error');
    expect(errorEvent?.attributes?.['tool.error_code']).toBe('TOOL_OUTPUT_TOO_LARGE');
    expect(String(errorEvent?.attributes?.['tool.error_message'] ?? '')).toContain('longer than 50000');
  });

  it('keeps shell command error spans flagged on non-zero exit', async () => {
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

    const spans = await runWithSpan(() => reducer.invoke(state, ctx as any));
    const span = spans[0];
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['tool.source']).toBe('shell');
    const errorEvent = span.events.find((event) => event.name === 'tool.error');
    expect(String(errorEvent?.attributes?.['tool.error_message'] ?? '')).toContain('exit code 2');
  });
});
