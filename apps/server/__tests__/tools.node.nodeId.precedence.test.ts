import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { ToolsNode } from '../src/lgnodes/tools.lgnode';
import { BaseTool } from '../src/tools/base.tool';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';

// Mock obs-sdk to capture attributes passed to withToolCall
vi.mock('@hautech/obs-sdk', () => {
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
    const res = await fn();
    return (res as any).raw; // return raw ToolMessage like real impl
  };
  return { withToolCall, ToolCallResponse, __test: { captured } } as any;
});

class EchoTool extends BaseTool {
  init(): DynamicStructuredTool {
    return tool(async (raw) => `echo:${JSON.stringify(raw)}`,
      { name: 'echo', description: 'echo tool', schema: ({} as any) },
    );
  }
}

describe('ToolsNode tool_call span attribution', () => {
  it('stamps nodeId=Tool id when provided (no toolNodeId attribute)', async () => {
    const node = new ToolsNode([new EchoTool()], 'agent-node-id'); // agent id should NOT be used for tool_call spans
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'echo', args: { x: 1 } }] } as any);
    const config = { configurable: { thread_id: 't1', nodeId: 'tool-node-id' } } as any;
    const res = await node.action({ messages: [ai] } as any, config);
    expect(res.done).toBeFalsy();
    const obs: any = await import('@hautech/obs-sdk');
    const captured = (obs as any).__test.captured as Array<{ nodeId?: string; toolNodeId?: string }>;
    expect(captured.length).toBeGreaterThan(0);
    // nodeId should equal the Tool node id
    expect(captured[0].nodeId).toBe('tool-node-id');
    // toolNodeId is no longer emitted
    expect(captured[0].toolNodeId).toBeUndefined();
  });

  it('omits nodeId when Tool id not provided (no agent fallback)', async () => {
    const obs: any = await import('@hautech/obs-sdk');
    (obs as any).__test.captured.length = 0; // reset captured

    const node = new ToolsNode([new EchoTool()], 'agent-node-id');
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '2', name: 'echo', args: { y: 2 } }] } as any);
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't2' } } as any);
    expect(res.done).toBeFalsy();
    const captured = (obs as any).__test.captured as Array<{ nodeId?: string; toolNodeId?: string }>;
    expect(captured.length).toBeGreaterThan(0);
    // No nodeId should be set when tool id is missing
    expect(captured[0].nodeId).toBeUndefined();
    expect(captured[0].toolNodeId).toBeUndefined();
  });
});
