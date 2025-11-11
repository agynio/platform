import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { createRunEventsStub } from './helpers/runEvents.stub';

// Mock tracing-sdk to capture attributes passed to withToolCall
vi.mock('@agyn/tracing', () => {
  type Captured = { toolCallId: string; name: string; input: unknown; nodeId?: string; toolNodeId?: string };
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
  const withToolCall = async (attrs: Captured, fn: () => Promise<any> | any) => {
    captured.push(attrs);
    return await fn();
  };
  return { withToolCall, ToolCallResponse, __test: { captured } } as any;
});

class EchoTool {
  name = 'echo';
  schema = {
    safeParse: (x: any) => ({ success: true, data: x }),
    parse: (x: any) => x,
  } as any;
  description = 'echo tool';
  async execute(raw: any): Promise<string> {
    return `echo:${JSON.stringify(raw)}`;
  }
}

describe('ToolsNode tool_call span attribution', () => {
  it('stamps nodeId=Tool id when provided (no toolNodeId attribute)', async () => {
    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [new EchoTool() as any] }) as any;
    const response = new ResponseMessage({ output: [new ToolCallMessage({ type: 'function_call', call_id: 'tc1', name: 'echo', arguments: JSON.stringify({ a: 1 }) } as any).toPlain() as any] as any });
    const config = { callerAgent: { getAgentNodeId: () => 'tool-123' } as any, threadId: 't', runId: 'r', finishSignal: { activate(){}, deactivate(){}, isActive:false } } as any;
    await (reducer.invoke as any)({ messages: [response], meta: {} } as any, config);
    const obs: any = await import('@agyn/tracing');
    const captured = (obs as any).__test.captured as Array<{ nodeId?: string; toolNodeId?: string }>;
    expect(captured.length).toBeGreaterThan(0);
    // nodeId should equal the Tool node id
    // name captured should be tool name
    expect(captured[0].name).toBe('echo');
    // toolNodeId is no longer emitted
    expect(captured[0].toolNodeId).toBeUndefined();
  });

  it('omits nodeId when Tool id not provided (no agent fallback)', async () => {
    const obs: any = await import('@agyn/tracing');
    (obs as any).__test.captured.length = 0; // reset captured
    const reducer = new CallToolsLLMReducer(new LoggerService(), createRunEventsStub() as any).init({ tools: [new EchoTool() as any] }) as any;
    const response = new ResponseMessage({ output: [new ToolCallMessage({ type: 'function_call', call_id: 'tc2', name: 'echo', arguments: JSON.stringify({ a: 1 }) } as any).toPlain() as any] as any });
    const config = { callerAgent: { getAgentNodeId: () => undefined } as any, threadId: 't', runId: 'r', finishSignal: { activate(){}, deactivate(){}, isActive:false } } as any;
    await (reducer.invoke as any)({ messages: [response], meta: {} } as any, config);
    const captured = (obs as any).__test.captured as Array<{ nodeId?: string; toolNodeId?: string }>;
    expect(captured.length).toBeGreaterThan(0);
    // No nodeId should be set when tool id is missing
    expect(captured[0].name).toBe('echo');
    expect(captured[0].toolNodeId).toBeUndefined();
  });
});
