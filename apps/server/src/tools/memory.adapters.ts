import { MemoryService } from '../services/memory.service';
import { buildMemoryTools } from './memory.tools';
import { LangChainToolAdapter } from './langchainTool.adapter';
import { BaseTool } from './base.tool';

/**
 * Build BaseTool adapters for the memory toolset so they can be attached to SimpleAgent.
 * Adapts the underlying LangChain DynamicStructuredTool instances via LangChainToolAdapter.
 */
export function buildMemoryToolAdapters(
  serviceFactory: (opts: { threadId?: string }) => MemoryService,
): BaseTool[] {
  const lc = buildMemoryTools(serviceFactory);
  return [lc.read, lc.list, lc.append, lc.update, lc.delete].map((t) => new LangChainToolAdapter(t));
}
