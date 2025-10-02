import { Db } from 'mongodb';
import { z } from 'zod';
import { MemoryService, MemoryScope } from '../services/memory.service';
import { buildMemoryToolAdapters } from '../tools/memory.adapters';
import type { BaseTool } from '../tools/base.tool';

export interface MemoryNodeConfig {
  scope: MemoryScope; // 'global' | 'perThread'
  collectionPrefix?: string;
}

// Static config exposed to UI for MemoryNode
export const MemoryNodeStaticConfigSchema = z
  .object({
    scope: z.enum(['global', 'thread']).default('global'),
    collectionPrefix: z.string().optional(),
  })
  .strict();
export type MemoryNodeStaticConfig = z.infer<typeof MemoryNodeStaticConfigSchema>;

/**
 * MemoryNode factory returns an accessor to build a MemoryService scoped to the node and thread.
 * Inject Db from MongoService.getDb() at template wiring time.
 */
export class MemoryNode {
  constructor(private db: Db, private nodeId: string, private config: MemoryNodeConfig) {}

  // Accept either internal config shape or static schema shape; map 'thread' -> 'perThread'.
  setConfig(config: Partial<MemoryNodeConfig> & Partial<MemoryNodeStaticConfig>) {
    const next: Partial<MemoryNodeConfig> = { ...this.config };
    if (config.scope !== undefined) {
      const scopeVal = (config as any).scope;
      next.scope = scopeVal === 'thread' ? 'perThread' : scopeVal;
    }
    if (config.collectionPrefix !== undefined) next.collectionPrefix = config.collectionPrefix;
    this.config = { ...this.config, ...next } as MemoryNodeConfig;
  }

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    return new MemoryService(this.db, this.nodeId, this.config.scope, threadId);
  }

  // Expose memory tools as BaseTool adapters built on top of this node's MemoryService factory
  getTools(): BaseTool[] {
    const factory = (opts: { threadId?: string }) => this.getMemoryService(opts);
    return buildMemoryToolAdapters(factory);
  }
}
