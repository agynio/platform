import { MongoService } from '../services/mongo.service';
import { MemoryNode, type MemoryNodeConfig } from '../lgnodes/memory.node';
import { MemoryConnectorNode } from '../lgnodes/memory.connector.node';
import { buildMemoryToolAdapters } from '../tools/memory.adapters';

// Factory for memory-related instances to keep templates.ts thin.
export function createMemoryRegistry(dbProvider: { getDb: MongoService['getDb'] }, nodeId: string) {
  const mongoDb = dbProvider.getDb();
  const memNode = new MemoryNode(mongoDb, nodeId, { scope: 'global' });

  return {
    createConnector(config?: { placement?: 'after_system' | 'last_message'; content?: 'full' | 'tree'; maxChars?: number }) {
      const factory = (opts: { threadId?: string }) => memNode.getMemoryService({ threadId: opts.threadId });
      return new MemoryConnectorNode(factory, {
        placement: config?.placement || 'after_system',
        content: config?.content || 'tree',
        maxChars: config?.maxChars ?? 4000,
      });
    },
    get memoryTools() {
      const factory = (opts: { threadId?: string }) => memNode.getMemoryService({ threadId: opts.threadId });
      return buildMemoryToolAdapters(factory);
    },
    setConfig(cfg: Partial<MemoryNodeConfig>) {
      memNode.setConfig(cfg);
    },
  };
}
