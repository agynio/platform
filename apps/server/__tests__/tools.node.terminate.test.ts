import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolsNode } from '../src/nodes/tools.node';
import { BaseTool } from '../src/tools/base.tool';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { TerminateResponse } from '../src/tools/terminateResponse';

class TerminatingTool extends BaseTool {
  init(): DynamicStructuredTool {
    return tool(async (raw) => new TerminateResponse((raw as any)?.note || 'done'), {
      name: 'finish',
      description: 'finish tool',
      schema: ({} as any),
    });
  }
}

class EchoTool extends BaseTool {
  init(): DynamicStructuredTool {
    return tool(async (raw) => `echo:${JSON.stringify(raw)}`, {
      name: 'echo',
      description: 'echo tool',
      schema: ({} as any),
    });
  }
}

describe('ToolsNode termination', () => {
  it('sets done=true when tool returns TerminateResponse and includes note in ToolMessage', async () => {
    const node = new ToolsNode([new TerminatingTool()]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'finish', args: { note: 'complete' } }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    expect(res.done).toBe(true);
    const tm = res.messages?.items?.[0];
    expect((tm as any).name).toBe('finish');
    expect((tm as any).content).toBe('complete');
  });

  it('does not set done for non-terminating tools', async () => {
    const node = new ToolsNode([new EchoTool()]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '2', name: 'echo', args: { x: 1 } }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    expect(res.done).toBeFalsy();
    expect((res.messages?.items?.[0] as any).content).toContain('echo');
  });
});
