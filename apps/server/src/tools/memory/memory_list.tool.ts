import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, OptionalPathSchemaUI, normalizePathRuntime } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

// Expose optional path in static config for UI; normalized at runtime
export const MemoryListToolStaticConfigSchema = z.object({ path: OptionalPathSchemaUI }).strict();

export class MemoryListTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryListToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const path = args.path ? normalizePathRuntime(args.path) : '/';
        const items = await service.list(path);
        return JSON.stringify(items);
      },
      { name: 'memory_list', description: 'List memory directory', schema },
    );
  }
}
