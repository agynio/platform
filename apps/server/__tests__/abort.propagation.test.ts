import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { ToolsNode } from '../src/lgnodes/tools.lgnode';
import { tool } from '@langchain/core/tools';
import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';

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

    const node = new ToolsNode([{ init: () => longTool } as unknown as { init: () => any }], 'tools-1');
    const ai = new AIMessage({ content: '', tool_calls: [{ id: 'x', name: 'long', args: {} }] as unknown as any });
    const ac = new AbortController();
    // Abort before invoking to ensure deterministic throw
    ac.abort();
    const p = node.action({ messages: [ai] } as unknown as { messages: any[] }, { configurable: { thread_id: 't', nodeId: 'tools-1', abort_signal: ac.signal } });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
