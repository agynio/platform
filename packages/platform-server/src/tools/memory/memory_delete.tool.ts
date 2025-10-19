import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, PathSchemaUI, normalizePathRuntime } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

export const MemoryDeleteToolStaticConfigSchema = z.object({ path: PathSchemaUI }).strict();

export class MemoryDeleteTool extends MemoryToolBase {
  constructor(logger: LoggerService) { super(logger); }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryDeleteToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        this.logger.info('Tool called', 'memory_args', { args: args });
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const path = normalizePathRuntime(args.path);
        const res = await service.delete(path);
        return JSON.stringify(res);
      },
      { name: 'memory_delete', description: 'Delete memory path (file or dir subtree)', schema },
    );
  }
}
