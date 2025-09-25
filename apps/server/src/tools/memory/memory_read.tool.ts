import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../base.tool';
import { LoggerService } from '../../services/logger.service';
import { MemoryService } from '../../services/memory.service';

export class MemoryReadTool extends BaseTool {
  private ms?: MemoryService;
  constructor(private logger: LoggerService) { super(); }
  setMemoryService(ms: unknown) { this.ms = ms as MemoryService; }
  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'memory_read',
      description: 'Read from memory at path',
      schema: z.object({ path: z.string() }),
      func: async (input) => {
        if (!this.ms) throw new Error('MemoryService not set');
        const s = await this.ms.stat(input.path);
        if (!s.exists || s.kind === 'missing') return { exists: false } as any;
        if (s.kind === 'dir') {
          const children = await this.ms.list(input.path);
          return { type: 'dir', children } as any;
        } else {
          const value = await this.ms.read(input.path);
          return { type: 'file', value } as any;
        }
      },
    });
  }
}
