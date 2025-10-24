import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GraphStateUpsertService, GraphDefinition } from './types';

/**
 * Centralized service to persist per-node runtime state and reflect changes in the in-memory runtime snapshot.
 * Minimal, non-Nest class to avoid broader DI changes for now.
 */
export class NodeStateService {
  constructor(
    private readonly graphService: GraphStateUpsertService,
    private readonly runtime: LiveGraphRuntime,
    private readonly logger: LoggerService,
  ) {}

  async upsertNodeState(nodeId: string, state: Record<string, unknown>, name = 'main'): Promise<void> {
    try {
      // Persist via repository through shared interface
      await this.graphService.upsertNodeState(name, nodeId, state);
      // Reflect into runtime snapshot with guards
      // Update runtime snapshot via typed helper
      this.runtime.updateNodeState(nodeId, state);
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}
