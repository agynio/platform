import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { GraphRepository } from './graph.repository';
import { mergeWith, isArray } from 'lodash-es';
import { EventsBusService } from '../events/events-bus.service';

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
 * Centralized service to persist per-node runtime state && reflect changes in the in-memory runtime snapshot.
 * Minimal, non-Nest class to avoid broader DI changes for now.
 */
@Injectable({ scope: Scope.DEFAULT })
export class NodeStateService {
  private readonly logger = new Logger(NodeStateService.name);

  constructor(
    @Inject(GraphRepository) private readonly graphRepository: GraphRepository,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {}

  /** Return last known runtime snapshot for a node (for filtering). */
  getSnapshot(nodeId: string): Record<string, unknown> | undefined {
    return this.runtime.getNodeStateSnapshot(nodeId);
  }

  async upsertNodeState(nodeId: string, patch: Record<string, unknown>, name = 'main'): Promise<void> {
    try {
      // Deep-merge previous snapshot with incoming patch (arrays replace)
      const prev = this.runtime.getNodeStateSnapshot(nodeId) || {};
      const merged = mergeWith({}, prev, patch, (objValue, srcValue) => {
        if (isArray(objValue) && isArray(srcValue)) return srcValue;
        return undefined;
      });
      // Persist merged via repository, update runtime with merged
      await this.graphRepository.upsertNodeState(name, nodeId, merged);
      this.runtime.updateNodeState(nodeId, merged);
      // Invoke node instance setState with merged snapshot for runtime reactions
      const inst = this.runtime.getNodeInstance(nodeId);
      try {
        await inst?.setState?.(merged as Record<string, unknown>);
      } catch (e) {
        this.logger.error(
          `NodeStateService: instance.setState failed ${JSON.stringify({ nodeId, error: String(e) })}`,
        );
      }
      this.eventsBus.emitNodeState({ nodeId, state: merged, updatedAtMs: Date.now() });
    } catch (e) {
      this.logger.error(
        `NodeStateService: upsertNodeState failed ${JSON.stringify({ nodeId, error: String(e) })}`,
      );
    }
  }
}
