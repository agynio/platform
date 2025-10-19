import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, PathSchemaUI, normalizePathRuntime } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

export const MemoryAppendToolStaticConfigSchema = z.object({ path: PathSchemaUI, data: z.string() }).strict();

export class MemoryAppendTool extends MemoryToolBase {
  constructor(logger: LoggerService) { super(logger); }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryAppendToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        this.logger.info('Tool called', 'memory_append', { args: args });
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const path = normalizePathRuntime(args.path);
        await service.append(path, args.data);
        return 'ok';
      },
      { name: 'memory_append', description: 'Append string to memory file', schema },
    );
  }
}
