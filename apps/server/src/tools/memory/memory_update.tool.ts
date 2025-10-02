import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryUpdateToolStaticConfigSchema = z.object({}).strict();

export class MemoryUpdateTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = z.object({ path: z.string(), old_data: z.string(), new_data: z.string() });
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const count = await service.update(args.path, args.old_data, args.new_data);
        return String(count);
      },
      { name: 'memory_update', description: 'Replace occurrences in memory file', schema },
    );
  }
}
