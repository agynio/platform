import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryDeleteToolStaticConfigSchema = z.object({}).strict();

export class MemoryDeleteTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = z.object({ path: z.string() });
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const res = await service.delete(args.path);
        return JSON.stringify(res);
      },
      { name: 'memory_delete', description: 'Delete memory path (file or dir subtree)', schema },
    );
  }
}
