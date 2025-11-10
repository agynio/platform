import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import type { MemoryScope } from '../../nodes/memory.types';
import { MemoryService } from '../../nodes/memory.service';
import Node from '../base/Node';
import { LoggerService } from '../../../core/services/logger.service';

export interface MemoryNodeConfig {
  scope: MemoryScope; // 'global' | 'perThread'
  collectionPrefix?: string;
}

// Static config exposed to UI for MemoryNode
export const MemoryNodeStaticConfigSchema = z
  .object({
    scope: z.enum(['global', 'perThread']).default('global'),
    collectionPrefix: z.string().optional(),
    // UI display only; not used by service
    title: z.string().min(1).optional(),
  })
  .strict();
export type MemoryNodeStaticConfig = z.infer<typeof MemoryNodeStaticConfigSchema>;

/**
 * MemoryNode factory returns an accessor to build a MemoryService scoped to the node and thread.
 */

@Injectable()
export class MemoryNode extends Node<MemoryNodeStaticConfig> {
  constructor(
    @Inject(ModuleRef) private moduleRef: ModuleRef,
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
  }

  init(params: { nodeId: string }): void {
    super.init(params);
  }

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    const svc = this.moduleRef.get(MemoryService, { strict: false });
    // Return a bound adapter implementing MemoryService methods for this node/thread
    return svc.forMemory(this.nodeId, this.config.scope, threadId) as unknown as MemoryService;
  }

  getPortConfig() {
    return { sourcePorts: { $self: { kind: 'instance' } } } as const;
  }
}
