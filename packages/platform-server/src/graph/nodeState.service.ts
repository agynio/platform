import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { GraphRepository } from './graph.repository';

/**
 * Centralized service to persist per-node runtime state and reflect changes in the in-memory runtime snapshot.
 * Minimal, non-Nest class to avoid broader DI changes for now.
 */
@Injectable({ scope: Scope.DEFAULT })
export class NodeStateService {
  constructor(
    @Inject(GraphRepository) private readonly graphRepository: GraphRepository,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(GraphSocketGateway) private readonly gateway?: GraphSocketGateway,
  ) {}

  /** Return last known runtime snapshot for a node (for filtering). */
  getSnapshot(nodeId: string): Record<string, unknown> | undefined {
    return this.runtime.getNodeStateSnapshot(nodeId);
  }

  async upsertNodeState(nodeId: string, state: Record<string, unknown>, name = 'main'): Promise<void> {
    try {
      // Capture previous snapshot to compute merged view for runtime and hooks
      const prev = this.runtime.getNodeStateSnapshot(nodeId);
      const merged: Record<string, unknown> = { ...(prev || {}), ...(state || {}) };
      // Persist via repository through shared interface (patch semantics)
      await this.graphRepository.upsertNodeState(name, nodeId, state);
      // Reflect merged view into runtime snapshot via typed helper
      this.runtime.updateNodeState(nodeId, merged);
      // Emit strictly-typed node_state event (payload remains the patch)
      this.gateway?.emitNodeState(nodeId, state);
      // Duck-typed hook on live node instance (if present)
      const inst = this.runtime.getNodeInstance(nodeId) as
        | { onNodeStateUpdated?: (next: Record<string, unknown>, prev?: Record<string, unknown>) => void }
        | undefined;
      try {
        inst?.onNodeStateUpdated?.(merged, prev);
      } catch (e) {
        this.logger.error('NodeStateService: onNodeStateUpdated hook error for %s: %s', nodeId, String(e));
      }
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}
