import { Inject, Injectable, Scope } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { GraphRepository } from './graph.repository';

export function deepMergeNodeState(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

  const result: Record<string, unknown> = { ...prev };
  for (const key of Object.keys(patch)) {
    const nextVal: unknown = patch[key];
    if (typeof nextVal === 'undefined') continue; // avoid introducing undefined keys
    const prevVal: unknown = result[key];
    if (Array.isArray(nextVal)) {
      result[key] = nextVal as unknown[];
    } else if (isPlainObject(nextVal) && isPlainObject(prevVal)) {
      result[key] = deepMergeNodeState(prevVal, nextVal);
    } else {
      result[key] = nextVal as Exclude<unknown, undefined>;
    }
  }
  return result;
}

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

  /**
   * Deep merge helper for node state upserts.
   * - Objects: merge recursively
   * - Arrays: replace entirely
   * - Primitives: replace
   * - Undefined in patch: skip (do not introduce undefined keys)
   */
  private deepMerge(prev: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    return deepMergeNodeState(prev, patch);
  }

  async upsertNodeState(nodeId: string, state: Record<string, unknown>, name = 'main'): Promise<void> {
    try {
      const prev = this.runtime.getNodeStateSnapshot(nodeId) || {};
      const merged = this.deepMerge(prev, state);
      // Persist via repository through shared interface (full merged state)
      await this.graphRepository.upsertNodeState(name, nodeId, merged);
      // Reflect into runtime snapshot via typed helper
      this.runtime.updateNodeState(nodeId, merged);
      // Emit strictly-typed node_state event with merged state
      this.gateway?.emitNodeState(nodeId, merged);
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}
