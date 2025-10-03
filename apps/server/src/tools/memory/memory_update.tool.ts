import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, PathSchemaUI, normalizePathRuntime } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryUpdateToolStaticConfigSchema = z.object({ path: PathSchemaUI, old_data: z.string(), new_data: z.string() }).strict();

export class MemoryUpdateTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryUpdateToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const path = normalizePathRuntime(args.path);
        const count = await service.update(path, args.old_data, args.new_data);
        return String(count);
      },
      { name: 'memory_update', description: 'Replace occurrences in memory file', schema },
    );
  }
}
