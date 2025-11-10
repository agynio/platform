import z from 'zod';
import { LoggerService } from '../../../../core/services/logger.service';
import { BaseToolNode } from '../baseToolNode';
import { UnifiedMemoryFunctionTool } from './memory.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

// Minimal service surface consumed by the tool
type MemoryToolService = {
  read: (path: string) => Promise<string>;
  list: (path?: string) => Promise<Array<{ name: string; kind: 'file' | 'dir' }>>;
  append: (path: string, content: string) => Promise<void>;
  update: (path: string, oldContent: string, content: string) => Promise<number>;
  delete: (path: string) => Promise<{ files: number; dirs: number }>;
};

// Node-level static config for the tool instance (UI). Mirrors call_agent pattern.
export const MemoryToolNodeStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional().describe('Optional description for tool metadata.'),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name (a-z, 0-9, underscore). Default: memory'),
    title: z.string().min(1).optional().describe('UI-only title for the node.'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class MemoryToolNode extends BaseToolNode<z.infer<typeof MemoryToolNodeStaticConfigSchema>> {
  private toolInstance?: UnifiedMemoryFunctionTool;

  private memoryFactory?: (opts: { threadId?: string }) => MemoryToolService;
  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super(logger);
  }
  setMemorySource(
    source:
      | ((opts: { threadId?: string }) => unknown)
      | { getMemoryService: (opts: { threadId?: string }) => unknown },
  ) {
    if (typeof source === 'function') this.memoryFactory = source as (opts: { threadId?: string }) => MemoryToolService;
    else if (source && typeof (source as { getMemoryService?: unknown }).getMemoryService === 'function')
      this.memoryFactory = (opts) => (source as { getMemoryService: (opts: { threadId?: string }) => unknown }).getMemoryService(opts) as MemoryToolService;
    else throw new Error('Invalid memory source');
    this.toolInstance = undefined;
  }

  getTool(): UnifiedMemoryFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new UnifiedMemoryFunctionTool({
        getDescription: () => this.config.description || 'Unified Memory tool: read, list, append, update, delete',
        getName: () => this.config.name || 'memory',
        getMemoryFactory: () => this.memoryFactory,
        logger: this.logger,
      });
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } },
    } as const;
  }
}
