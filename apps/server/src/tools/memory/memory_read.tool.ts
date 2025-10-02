import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryReadToolStaticConfigSchema = z.object({}).strict();

export class MemoryReadTool extends MemoryToolBase {
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = z.object({ path: z.string() });
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const content = await service.read(args.path);
        return content;
      },
      { name: 'memory_read', description: 'Read memory file content', schema },
    );
  }
}
