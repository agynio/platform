import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from '../base.tool';
import { MemoryService } from '../../services/memory.service';
import { LangGraphRunnableConfig } from '@langchain/langgraph';

// Common base to inject a memory service factory into individual memory tools
export abstract class MemoryToolBase extends BaseTool {
  protected serviceFactory: ((opts: { threadId?: string }) => MemoryService) | undefined;

  setMemoryFactory(factory: (opts: { threadId?: string }) => MemoryService): void {
    this.serviceFactory = factory;
  }

  protected requireFactory(): (opts: { threadId?: string }) => MemoryService {
    if (!this.serviceFactory) throw new Error('Memory tool: memory factory not set');
    return this.serviceFactory;
  }

  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
}
