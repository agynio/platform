import { Db } from 'mongodb';
import { z } from 'zod';
import { MemoryService, MemoryScope } from '../../nodes/memory.repository';
import Node from '../base/Node';
import { Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface MemoryNodeConfig {
  scope: MemoryScope; // 'global' | 'perThread'
  collectionPrefix?: string;
}

// Static config exposed to UI for MemoryNode
export const MemoryNodeStaticConfigSchema = z
  .object({
    scope: z.enum(['global', 'thread']).default('global'),
    collectionPrefix: z.string().optional(),
    // UI display only; not used by service
    title: z.string().min(1).optional(),
  })
  .strict();
export type MemoryNodeStaticConfig = z.infer<typeof MemoryNodeStaticConfigSchema>;

/**
 * MemoryNode factory returns an accessor to build a MemoryService scoped to the node and thread.
 * Inject Db from MongoService.getDb() at template wiring time.
 */

@Injectable({ scope: Scope.TRANSIENT })
export class MemoryNode extends Node<MemoryNodeStaticConfig> {
  constructor(private db: Db, private moduleRef: ModuleRef) {
    super();
  }

  private config: MemoryNodeConfig = { scope: 'global' };

  init(params: { nodeId: string }): void {
    super.init(params);
  }

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    const svc = this.moduleRef.create(MemoryService);
    svc.init({ nodeId: this.nodeId, scope: this.config.scope, threadId });
    return svc;
  }

  getPortConfig() {
    return { sourcePorts: { $self: { kind: 'instance' } } } as const;
  }
}
