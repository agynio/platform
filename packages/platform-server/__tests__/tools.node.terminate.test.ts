import { describe, it, expect, vi } from 'vitest';
import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { TerminateResponse } from '../src/tools/terminateResponse';
import { FinishFunctionTool } from '../src/nodes/tools/finish/finish.tool';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';

class TerminatingTool /* extends BaseTool (legacy) */ {
  init(): DynamicStructuredTool {
    return tool(async (raw) => new TerminateResponse((raw as any)?.note || 'done'), {
      name: 'finish',
      description: 'finish tool',
      schema: ({} as any),
    });
  }
}

class EchoTool /* extends BaseTool (legacy) */ {
  init(): DynamicStructuredTool {
    return tool(async (raw) => `echo:${JSON.stringify(raw)}`, {
      name: 'echo',
      description: 'echo tool',
      schema: ({} as any),
    });
  }
}

describe('CallToolsLLMReducer termination via finish tool', () => {
  it('sets done=true when tool returns TerminateResponse and includes note in ToolMessage', async () => {
    // Build FunctionTools list including finish
    const finish = new FinishFunctionTool();
    const term = new TerminatingTool().init();
    const tools = [finish, term] as any;
    const reducer = new CallToolsLLMReducer(new LoggerService(), tools);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'finish', args: { note: 'complete' } }] });
    const state = await reducer.invoke({ messages: [ai], meta: {} } as any, { configurable: { thread_id: 't' } } as any);
    const tm = state.messages.at(-1) as any;
    expect(tm?.name).toBe('finish');
    expect(String(tm?.output)).toContain('complete');
  });

  it('does not set done for non-terminating tools', async () => {
    const echo = new EchoTool().init();
    const reducer = new CallToolsLLMReducer(new LoggerService(), [echo] as any);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '2', name: 'echo', args: { x: 1 } }] });
    const state = await reducer.invoke({ messages: [ai], meta: {} } as any, { configurable: { thread_id: 't' } } as any);
    const tm = state.messages.at(-1) as any;
    expect(String(tm?.output)).toContain('echo');
  });
});
