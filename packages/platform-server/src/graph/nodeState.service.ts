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
      // Persist via repository through shared interface
      await this.graphRepository.upsertNodeState(name, nodeId, state);
      // Reflect into runtime snapshot via typed helper
      this.runtime.updateNodeState(nodeId, state);
      // Emit strictly-typed node_state event
      this.gateway?.emitNodeState(nodeId, state);
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}
