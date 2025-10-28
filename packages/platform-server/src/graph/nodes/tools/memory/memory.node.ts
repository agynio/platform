import z from 'zod';
import { LoggerService } from '../../../../core/services/logger.service';
import { MemoryService } from '../../../nodes/memory.repository';
import { BaseToolNode } from '../baseToolNode';
import { UnifiedMemoryFunctionTool } from './memory.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

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
  private staticCfg: z.infer<typeof MemoryToolNodeStaticConfigSchema> = {};
  private memoryFactory?: (opts: { threadId?: string }) => MemoryService;
  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super(logger);
  }
  setMemorySource(
    source:
      | ((opts: { threadId?: string }) => MemoryService)
      | { getMemoryService: (opts: { threadId?: string }) => MemoryService },
  ) {
    if (typeof source === 'function') this.memoryFactory = source as (opts: { threadId?: string }) => MemoryService;
    else if (source && typeof (source as { getMemoryService?: unknown }).getMemoryService === 'function')
      this.memoryFactory = (opts) => source.getMemoryService!(opts);
    else throw new Error('Invalid memory source');
    this.toolInstance = undefined;
  }
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = MemoryToolNodeStaticConfigSchema.safeParse(cfg || {});
    if (!parsed.success) throw new Error('Invalid Memory node config');
    this.staticCfg = parsed.data;
    this.toolInstance = undefined;
  }
  getTool(): UnifiedMemoryFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new UnifiedMemoryFunctionTool({
        getDescription: () => this.staticCfg.description || 'Unified Memory tool: read, list, append, update, delete',
        getName: () => this.staticCfg.name || 'memory',
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
