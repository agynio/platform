import { Db } from 'mongodb';
import { z } from 'zod';
import { MemoryService, MemoryScope } from '../services/memory.service';
import type { NodeLifecycle } from './types';

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
export class MemoryNode implements NodeLifecycle<Partial<MemoryNodeConfig> & Partial<MemoryNodeStaticConfig>> {
  constructor(private db: Db, private nodeId: string) {}

  private config: MemoryNodeConfig = { scope: 'global' };

  // Accept either internal config shape or static schema shape; map 'thread' -> 'perThread'.
  setConfig(config: Partial<MemoryNodeConfig> & Partial<MemoryNodeStaticConfig>) {
    this.configure(config);
  }

  configure(config: Partial<MemoryNodeConfig> & Partial<MemoryNodeStaticConfig>) {
    const next: Partial<MemoryNodeConfig> = { ...this.config };
    if (config.scope !== undefined) {
      const scopeVal = (config as any).scope;
      next.scope = scopeVal === 'thread' ? 'perThread' : scopeVal;
    }
    if (config.collectionPrefix !== undefined) next.collectionPrefix = config.collectionPrefix;
    // title is UI-only; accept and ignore for runtime behavior
    this.config = { ...this.config, ...next } as MemoryNodeConfig;
  }

  async start(): Promise<void> { /* no-op */ }
  async stop(): Promise<void> { /* no-op */ }
  async delete(): Promise<void> { /* no-op */ }

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    return new MemoryService(this.db, this.nodeId, this.config.scope, threadId);
  }
}
