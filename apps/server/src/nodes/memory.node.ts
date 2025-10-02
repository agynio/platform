import { Db } from 'mongodb';
import { MemoryService, MemoryScope } from '../services/memory.service';

export interface MemoryNodeConfig {
  scope: MemoryScope; // 'global' | 'perThread'
}

/**
 * MemoryNode factory returns an accessor to build a MemoryService scoped to the node and thread.
 * Inject Db from MongoService.getDb() at template wiring time.
 */
export class MemoryNode {
  constructor(private db: Db, private nodeId: string, private config: MemoryNodeConfig) {}

  setConfig(config: Partial<MemoryNodeConfig>) {
    this.config = { ...this.config, ...config };
  }

  getMemoryService(opts: { threadId?: string }): MemoryService {
    const threadId = this.config.scope === 'perThread' ? opts.threadId : undefined;
    return new MemoryService(this.db, this.nodeId, this.config.scope, threadId);
  }
}
