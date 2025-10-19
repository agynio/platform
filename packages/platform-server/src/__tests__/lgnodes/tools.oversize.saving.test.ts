import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { ToolsNode } from '../../lgnodes/tools.lgnode';
import { BaseTool } from '../../tools/base.tool';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from '../../services/logger.service';

class MockContainer {
  constructor(public id = 'cid') {}
  async putArchive(_data: Buffer, _opts: { path: string }) { return; }
}

class SavingTool extends BaseTool {
  init() {
    return tool(async () => 'X'.repeat(50_001), { name: 'save', description: '', schema: z.object({}).strict() });
  }
  async getContainerForThread() {
    return new (MockContainer as any)();
  }
}

class FailingPutArchiveTool extends BaseTool {
  init() { return tool(async () => 'Y'.repeat(50_100), { name: 'failSave', description: '', schema: z.object({}).strict() }); }
  async getContainerForThread() {
    return { putArchive: async () => { throw new Error('boom'); } } as any;
  }
}

class NoContainerTool extends BaseTool {
  init() { return tool(async () => 'Z'.repeat(60_000), { name: 'noContainer', description: '', schema: z.object({}).strict() }); }
}

describe('ToolsNode oversize output handling', () => {
  it('saves to container when available and returns new error format', async () => {
    const node = new ToolsNode([new SavingTool(new LoggerService())]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'save', args: {} }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    const msg = (res.messages?.items?.[0] as any).content as string;
    expect(msg).toMatch(/^Error: output is too long \(50001 characters\)\. The output has been saved to \/tmp\/.+\.txt$/);
  });

  it('falls back when putArchive fails', async () => {
    const node = new ToolsNode([new FailingPutArchiveTool(new LoggerService())]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'failSave', args: {} }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    const msg = (res.messages?.items?.[0] as any).content as string;
    expect(msg).toBe('Error (output too long: 50100 characters).');
  });

  it('falls back when no container hook', async () => {
    const node = new ToolsNode([new NoContainerTool(new LoggerService())]);
    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'noContainer', args: {} }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    const msg = (res.messages?.items?.[0] as any).content as string;
    expect(msg).toBe('Error (output too long: 60000 characters).');
  });
});
