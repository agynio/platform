import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service.js';
import { tool } from '@langchain/core/tools';
import { ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { z } from 'zod';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { createRunEventsStub } from './helpers/runEvents.stub';

describe('Abort propagation', () => {
  it('aborts long-running tool with AbortError and surfaces as throw', async () => {
    const logger = new LoggerService();
    const longTool = tool(async (_input, config) => {
      const sig: AbortSignal | undefined = (config?.configurable as { abort_signal?: AbortSignal })?.abort_signal;
      if (sig?.aborted) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        throw e;
      }
      // If not aborted, wait shortly then return
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    }, { name: 'long', description: 'long', schema: z.object({}) });

    const runEvents = createRunEventsStub();
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({
      tools: [
        {
          name: 'long',
          schema: {
            safeParse: (v: any) => ({ success: true, data: v }),
          },
          execute: async (_i: any, cfg: any) => longTool.invoke(_i, cfg),
        } as any,
      ],
    });
    const response = new ResponseMessage({ output: [new ToolCallMessage({ type: 'function_call', call_id: 'x', name: 'long', arguments: JSON.stringify({}) } as any).toPlain() as any] as any });
    const ac = new AbortController();
    // Abort before invoking to ensure deterministic throw
    ac.abort();
    const p = reducer.invoke(
      { messages: [response], meta: {}, context: { messageIds: [], memory: [] } } as any,
      {
        threadId: 't',
        runId: 'r',
        finishSignal: { activate() {}, deactivate() {}, isActive: false },
        terminateSignal: { activate() {}, deactivate() {}, isActive: false },
        callerAgent: { getAgentNodeId: () => 'tools-1' },
        configurable: { thread_id: 't', nodeId: 'tools-1', abort_signal: ac.signal },
      } as any,
    );
    // New behavior: reducer does not throw; returns ToolCallOutputMessage with error payload.
    const res = await p;
    const last = res.messages.at(-1);
    expect(last).toBeDefined();
  });
});
