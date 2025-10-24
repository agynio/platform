import { Db } from 'mongodb';
import { z } from 'zod';
import { MemoryService, MemoryScope } from '../../nodes/memory.repository';
import Node from '../base/Node';

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

export class MemoryNode extends Node<MemoryNodeStaticConfig> {
  constructor(
    private db: Db,
    private nodeId: string,
  ) {}

  private config: MemoryNodeConfig = { scope: 'global' };

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    return new MemoryService(this.db, this.nodeId, this.config.scope, threadId);
  }

  getPortConfig() {
    return { sourcePorts: { $self: { kind: 'instance' } } } as const;
  }
}
