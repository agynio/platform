import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryListToolStaticConfigSchema = z.object({}).strict();

export class MemoryListTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = z.object({ path: z.string().optional() });
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const items = await service.list(args.path || '/');
        return JSON.stringify(items);
      },
      { name: 'memory_list', description: 'List memory directory', schema },
    );
  }
}
