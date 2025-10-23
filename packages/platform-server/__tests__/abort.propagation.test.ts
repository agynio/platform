import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service.js';
import { tool } from '@langchain/core/tools';
import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';

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

    const reducer = new CallToolsLLMReducer(new LoggerService(), [{ name: 'long', schema: z.object({}), execute: async (_i: any, cfg: any) => longTool.invoke(_i, cfg) } as any]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: 'x', name: 'long', args: {} }] as unknown as any });
    const ac = new AbortController();
    // Abort before invoking to ensure deterministic throw
    ac.abort();
    const p = reducer.invoke({ messages: [ai], meta: {} } as any, { configurable: { thread_id: 't', nodeId: 'tools-1', abort_signal: ac.signal } } as any);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
