import { describe, it, expect, vi } from 'vitest';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { ResponseMessage } from '@agyn/llm';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';
import { FinishFunctionTool } from '../src/nodes/tools/finish/finish.tool';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';

// Remove legacy TerminatingTool; FinishFunctionTool covers finish behavior

class EchoTool /* extends BaseTool (legacy) */ {
  init(): DynamicStructuredTool {
    return tool(async (raw) => `echo:${JSON.stringify(raw)}`, {
      name: 'echo',
      description: 'echo tool',
      schema: ({} as any),
    });
  }
}

describe('CallToolsLLMReducer finish tool output handling', () => {
  it('includes note from finish tool output in ToolCallOutputMessage', async () => {
    // Build FunctionTools list including finish
    const finish = new FinishFunctionTool({ logger: new LoggerService() });
    const tools = [finish] as any;
    const reducer = new CallToolsLLMReducer(new LoggerService(), tools);
    const call: ResponseFunctionToolCall = { type: 'function_call', name: 'finish', call_id: '1', arguments: JSON.stringify({ note: 'complete' }) } as any;
    const resp = new ResponseMessage({ output: [call] } as any);
    const state = await reducer.invoke({ messages: [resp], meta: {} } as any, { configurable: { thread_id: 't' } } as any);
    const tm = state.messages.at(-1) as any;
    expect(tm?.type).toBe('function_call_output');
    expect(String(tm?.text)).toContain('complete');
  });

  it('does not set output when unknown tool', async () => {
    const reducer = new CallToolsLLMReducer(new LoggerService(), [] as any);
    const call: ResponseFunctionToolCall = { type: 'function_call', name: 'echo', call_id: '2', arguments: JSON.stringify({ x: 1 }) } as any;
    const resp = new ResponseMessage({ output: [call] } as any);
    await expect(
      reducer.invoke({ messages: [resp], meta: {} } as any, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrow(/Unknown tool called/);
  });
});
