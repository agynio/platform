import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, PathSchemaUI, normalizePathRuntime } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

export const MemoryUpdateToolStaticConfigSchema = z
  .object({ path: PathSchemaUI, old_data: z.string(), new_data: z.string() })
  .strict();

export class MemoryUpdateTool extends MemoryToolBase {
  constructor(logger: LoggerService) { super(logger); }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryUpdateToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        // Trim noisy/sensitive payloads in logs
        const truncate = (s: string) => (s.length > 200 ? s.slice(0, 200) + '…' : s);
        this.logger.info('Tool called', 'memory_update', {
          args: { path: args.path, old_data: truncate(args.old_data), new_data: truncate(args.new_data) },
        });
        const factory = this.requireFactory();
        const service = factory({ threadId: runtimeCfg?.configurable?.thread_id });
        const path = normalizePathRuntime(args.path);
        const count = await service.update(path, args.old_data, args.new_data);
        // Prefer numeric output so callers can use directly
        return count;
      },
      { name: 'memory_update', description: 'Replace occurrences in memory file', schema },
    );
  }
}
