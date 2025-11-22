import { Inject, Injectable, Scope, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GraphRepository } from './graph.repository';
import { mergeWith, isArray } from 'lodash-es';
import { GraphEventsPublisher } from './events/graph.events.publisher';

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
  private publisher: GraphEventsPublisher | null;

  constructor(
    @Inject(GraphRepository) private readonly graphRepository: GraphRepository,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Optional() @Inject(GraphEventsPublisher) publisher?: GraphEventsPublisher,
  ) {
    this.publisher = publisher ?? null;
  }

  private async ensurePublisher(): Promise<GraphEventsPublisher | null> {
    if (this.publisher) return this.publisher;
    try {
      const resolved = await this.moduleRef.resolve(GraphEventsPublisher, undefined, { strict: false });
      if (resolved) {
        this.publisher = resolved;
        return resolved;
      }
    } catch (err) {
      this.logger.warn('NodeStateService: failed to resolve GraphEventsPublisher', err);
    }
    return null;
  }

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
        this.logger.error('NodeStateService: instance.setState failed for %s: %s', nodeId, String(e));
      }
      // Emit node_state with merged state via publisher bridge
      const publisher = await this.ensurePublisher();
      try {
        publisher?.emitNodeState(nodeId, merged);
      } catch (err) {
        this.logger.warn('NodeStateService: emitNodeState failed for %s: %s', nodeId, String(err));
      }
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}
