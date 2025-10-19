import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, OptionalPathSchemaUI, normalizePathRuntime, isMemoryDebugEnabled } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

// Expose optional path in static config for UI; normalized at runtime
export const MemoryListToolStaticConfigSchema = z.object({ path: OptionalPathSchemaUI }).strict();

export class MemoryListTool extends MemoryToolBase {
  constructor(logger: LoggerService) { super(logger); }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = MemoryListToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        const args = schema.parse(raw);
        this.logger.info('Tool called', 'memory_list', { args });
        const factory = this.requireFactory();
        const threadId = runtimeCfg?.configurable?.thread_id;
        const service = factory({ threadId });
        const path = args.path ? normalizePathRuntime(args.path) : '/';

        if (isMemoryDebugEnabled()) {
          const dbg = service.getDebugInfo();
          const exists = await service.checkDocExists();
          const st = await service.stat(path);
          this.logger.debug('memory_list debug', {
            normalizedPath: path,
            nodeId: dbg.nodeId,
            scope: dbg.scope,
            threadId: dbg.threadId,
            docExists: exists,
            statKind: st.kind,
          });
        }

        const items = await service.list(path);
        if (isMemoryDebugEnabled()) {
          const names = items.map((i) => i.name);
          this.logger.debug('memory_list result', {
            size: items.length,
            names,
          });
        }
        return JSON.stringify(items);
      },
      { name: 'memory_list', description: 'List memory directory', schema },
    );
  }
}
