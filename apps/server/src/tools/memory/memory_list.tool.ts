import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';
import { MemoryService } from '../../services/memory.service';

export class MemoryListTool extends BaseTool {
  private ms?: MemoryService;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms as MemoryService; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_list',
      description: 'List memory paths',
      schema: z.object({ path: z.string().optional() }),
      func: async (input) => {
        if (!this.ms) throw new Error('MemoryService not set');
        const p = input.path ?? '/';
        const items = await this.ms.list(p);
        return items as any;
      },
    });
  }
}
