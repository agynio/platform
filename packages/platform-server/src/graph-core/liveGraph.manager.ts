import {
  ExecutedEdgeRecord,
  GraphDiffResult,
  GraphRuntimeState,
  InternalDiffComputation,
  LiveNode,
  edgeKey,
} from '../graph/liveGraph.types';
import type { EdgeDef, GraphDefinition, NodeDef } from '../shared/types/graph.types';
import { GraphError } from '../graph/types';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ZodError, type ZodIssue } from 'zod';

import { LoggerService } from '../core/services/logger.service';
import type { NodeStatusState, StatusChangedEvent } from '../nodes/base/Node';
import type Node from '../nodes/base/Node';
import { Errors } from '../graph/errors';
import { PortsRegistry } from '../graph/ports.registry';
import type { TemplatePortConfig } from '../graph/ports.types';
import { GraphRepository } from '../graph/graph.repository';
import { TemplateRegistry } from './templateRegistry';
import { ReferenceResolverService } from '../utils/reference-resolver.service';
import { ResolveError } from '../utils/references';

const configsEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b); // unchanged

@Injectable()
export class LiveGraphRuntime {
  private state: GraphRuntimeState = {
    nodes: new Map<string, LiveNode>(),
    executedEdges: new Map(),
    inboundEdges: new Map(),
    outboundEdges: new Map(),
    version: 0,
    lastGraph: undefined,
  };

  // Paused fallback removed; pause/resume not supported in strict lifecycle.

  private applying: Promise<unknown> = Promise.resolve(); // serialize updates
  private portsRegistry: PortsRegistry;
  private statusListeners = new Set<
    (ev: { nodeId: string; prev: NodeStatusState; next: NodeStatusState; at: number }) => void
  >();
  private nodeStatusHandlers = new Map<string, (ev: StatusChangedEvent) => void>();
  private graphName = 'main';

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Optional() @Inject(ReferenceResolverService) private readonly referenceResolver?: ReferenceResolverService,
  ) {
    this.portsRegistry = new PortsRegistry();
  }

  // factoryDeps removed; factories should rely on FactoryContext primitives only

  get version() {
    return this.state.version;
  }
  getNodes() {
    return Array.from(this.state.nodes.values());
  }
  getExecutedEdges() {
    return Array.from(this.state.executedEdges.values());
  }
  /** Subscribe to node status changes across all nodes managed by the runtime. */
  subscribe(
    listener: (ev: { nodeId: string; prev: NodeStatusState; next: NodeStatusState; at: number }) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Load and apply a persisted graph from the provided repository.
   * Does not throw on failure; logs and returns { applied: false }.
   */
  public async load(): Promise<{ applied: boolean; version?: number }> {
    const name = 'main';
    this.graphName = name;
    const toRuntimeGraph = (saved: {
      nodes: Array<{
        id: string;
        template: string;
        config?: Record<string, unknown>;
        state?: Record<string, unknown>;
      }>;
      edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string }>;
      version: number;
    }) =>
      ({
        nodes: saved.nodes.map((n) => ({
          id: n.id,
          data: { template: n.template, config: n.config, state: n.state },
        })),
        edges: saved.edges.map((e) => ({
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      }) as GraphDefinition;

    try {
      const existing = await this.graphs.get(name);
      if (existing) {
        this.logger.info(
          'Applying persisted graph to live runtime (version=%s, nodes=%d, edges=%d)',
          existing.version,
          existing.nodes.length,
          existing.edges.length,
        );
        await this.apply(toRuntimeGraph(existing));
        this.logger.info('Initial persisted graph applied successfully');
        return { applied: true, version: existing.version };
      } else {
        this.logger.info('No persisted graph found; starting with empty runtime graph.');
        return { applied: false };
      }
    } catch (e) {
      if (e instanceof GraphError) {
        const cause = e && typeof e === 'object' && 'cause' in e ? (e as { cause?: unknown }).cause : undefined;
        this.logger.error('Failed to apply initial persisted graph: %s. Cause: %s', e.message, String(cause));
      }
      this.logger.error('Failed to apply initial persisted graph: %s', String(e));
      return { applied: false };
    }
  }

  // Persist a config update into the stored graph definition so future GETs / reloads reflect it.
  updateNodeConfig(id: string, cfg: Record<string, unknown>) {
    const live = this.state.nodes.get(id);
    if (live) live.config = cfg;
    if (this.state.lastGraph) {
      const node = this.state.lastGraph.nodes.find((n) => n.id === id);
      if (node) node.data.config = cfg;
    }
  }

  // Update persisted runtime snapshot state for a node (typed helper)
  updateNodeState(id: string, state: Record<string, unknown>): void {
    if (!this.state.lastGraph) return;
    const node = this.state.lastGraph.nodes.find((n) => n.id === id);
    if (node) {
      node.data.state = state;
    }
  }

  // Return the live node instance (if present).
  getNodeInstance(id: string): Node | undefined {
    return this.state.nodes.get(id)?.instance;
  }

  async apply(graph: GraphDefinition): Promise<GraphDiffResult> {
    this.applying = this.applying.then(() => this._applyGraphInternal(graph));
    return this.applying as Promise<GraphDiffResult>;
  }

  async provisionNode(id: string): Promise<void> {
    await this.state.nodes.get(id)?.instance?.provision();
  }
  async deprovisionNode(id: string): Promise<void> {
    await this.state.nodes.get(id)?.instance?.deprovision();
  }

  getNodeStatus(id: string): { provisionStatus?: { state: NodeStatusState; details?: unknown } } {
    const inst = this.state.nodes.get(id)?.instance;
    const st = inst?.status;
    return st ? { provisionStatus: { state: st } } : {};
  }

  /** Return the last known persisted runtime state snapshot for a node. */
  getNodeStateSnapshot(id: string): Record<string, unknown> | undefined {
    const node = this.state.lastGraph?.nodes.find((n) => n.id === id);
    return node?.data?.state as Record<string, unknown> | undefined;
  }

  private async _applyGraphInternal(next: GraphDefinition): Promise<GraphDiffResult> {
    const prev = this.state.lastGraph ?? ({ nodes: [], edges: [] } as GraphDefinition);
    const diff = this.computeDiff(prev, next);
    this.logger.info(
      'Applying graph diff: +%d nodes, -%d nodes, ~%d config updates, +%d edges, -%d edges',
      diff.addedNodes.length,
      diff.removedNodeIds.length,
      diff.configUpdateNodeIds.length,
      diff.addedEdges.length,
      diff.removedEdges.length,
    );
    const errors: GraphError[] = [];
    const logger = this.logger;
    const pushError = (err: GraphError) => {
      errors.push(err);
      throw err;
    };

    // 1. Add / Recreate nodes
    this.logger.debug('Instantiating nodes');
    for (const nodeDef of diff.addedNodes) {
      try {
        await this.instantiateNode(nodeDef);
      } catch (e) {
        pushError(e as GraphError);
      }
    }

    for (const nodeId of diff.recreatedNodeIds) {
      const old = this.state.nodes.get(nodeId);
      if (old) await this.disposeNode(nodeId); // ignore errors for now
      const nodeDef = next.nodes.find((n) => n.id === nodeId)!;
      try {
        await this.instantiateNode(nodeDef);
      } catch (e) {
        pushError(e as GraphError);
      }
    }

    // 2. Config updates
    this.logger.debug('Configuring nodes');
    for (const nodeId of diff.configUpdateNodeIds) {
      const nodeDef = next.nodes.find((n) => n.id === nodeId)!;
      const live = this.state.nodes.get(nodeId);
      if (!live) continue;
      try {
        const cfg = nodeDef.data.config || {};
        const resolved = await this.resolveNodeConfig(nodeId, cfg);
        const cleaned = await this.applyConfigWithUnknownKeyStripping(live.instance, 'setConfig', resolved, nodeId);
        // set live.config to cleaned object only on success
        live.config = cleaned;
      } catch (e) {
        logger?.error?.('Config update failed (setConfig)', nodeId, e);
        // non-fatal
      }
    }
    // 2b. Dynamic config removed: use node state mutations in future.

    // 3. Remove edges (reverse if needed) BEFORE removing nodes
    this.logger.debug('Remove edges');
    for (const rem of diff.removedEdges) {
      const key = edgeKey(rem);
      const rec = this.state.executedEdges.get(key);
      if (rec) {
        await this.tryReverseAndUnregister(rec).catch((e) => {
          logger.error('Edge reversal failed', key, e);
        });
      }
    }

    // 4. Remove nodes (and any residual edges referencing them)
    this.logger.debug('Remove nodes');
    for (const nodeId of diff.removedNodeIds) {
      await this.disposeNode(nodeId).catch((err) => pushError(err as GraphError));
    }

    // Persist next graph snapshot early so dependent services (e.g., NodeStateService)
    // can read initial state during first edge attachment and provisioning.
    // This ensures boot-time agent↔MCP sync uses the persisted state.
    this.state.lastGraph = next;

    // 5. Add edges
    this.logger.debug('Add edges');
    for (const edge of diff.addedEdges) {
      try {
        await this.executeEdge(edge, next);
      } catch (e) {
        pushError(e as GraphError);
      }
    }

    // 6. Provision nodes
    this.logger.debug('Provision nodes');
    await Promise.all(
      [...this.state.nodes.values()].map(async (live) => {
        await live.instance.provision();
      }),
    );

    // 7. Update state metadata
    this.logger.debug('Updating state metadata');
    this.state.version += 1;
    // lastGraph already set earlier to allow boot-time consumers to read snapshot

    const result: GraphDiffResult = {
      addedNodes: diff.addedNodes.map((n) => n.id),
      removedNodes: diff.removedNodeIds,
      recreatedNodes: diff.recreatedNodeIds,
      updatedConfigNodes: diff.configUpdateNodeIds,
      addedEdges: diff.addedEdges.map(edgeKey),
      removedEdges: diff.removedEdges.map(edgeKey),
      errors,
      version: this.state.version,
    };
    return result;
  }

  private computeDiff(prev: GraphDefinition, next: GraphDefinition): InternalDiffComputation {
    const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]));
    const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
    const addedNodes: NodeDef[] = [];
    const removedNodeIds: string[] = [];
    const recreatedNodeIds: string[] = [];
    const configUpdateNodeIds: string[] = [];
    // dynamicConfig removed

    // Nodes
    for (const n of next.nodes) {
      const prevNode = prevNodes.get(n.id);
      if (!prevNode) {
        addedNodes.push(n);
        continue;
      }
      if (prevNode.data.template !== n.data.template) {
        recreatedNodeIds.push(n.id);
        continue;
      }
      const prevCfg = prevNode.data.config || {};
      const nextCfg = n.data.config || {};
      if (!configsEqual(prevCfg, nextCfg)) configUpdateNodeIds.push(n.id);
      // dynamicConfig removed
    }
    for (const old of prev.nodes) {
      if (!nextNodes.has(old.id)) removedNodeIds.push(old.id);
    }

    // Edges
    const prevEdgeMap = new Map(prev.edges.map((e) => [edgeKey(e), e]));
    const nextEdgeMap = new Map(next.edges.map((e) => [edgeKey(e), e]));
    const addedEdges: EdgeDef[] = [];
    const removedEdges: EdgeDef[] = [];
    for (const [k, e] of nextEdgeMap.entries()) if (!prevEdgeMap.has(k)) addedEdges.push(e);
    for (const [k, e] of prevEdgeMap.entries()) if (!nextEdgeMap.has(k)) removedEdges.push(e);

    return {
      addedNodes,
      removedNodeIds,
      recreatedNodeIds,
      configUpdateNodeIds,
      dynamicConfigUpdateNodeIds: [],
      addedEdges,
      removedEdges,
    } as InternalDiffComputation;
  }

  private async instantiateNode(node: NodeDef): Promise<void> {
    try {
      const nodeClass = this.templateRegistry.getClass(node.data.template);
      if (!nodeClass) throw Errors.unknownTemplate(node.data.template, node.id);
      const created: Node = await this.moduleRef.create<Node>(nodeClass);
      const cfg = created.getPortConfig() as TemplatePortConfig;
      if (cfg) {
        this.portsRegistry.registerTemplatePorts(node.data.template, cfg);
        this.portsRegistry.validateTemplateInstance(node.data.template, created as unknown as Record<string, unknown>);
      }

      // NOTE: setGraphNodeId reflection removed; prefer factories to leverage ctx.nodeId directly.
      const live: LiveNode = { id: node.id, template: node.data.template, instance: created, config: node.data.config };
      this.state.nodes.set(node.id, live);
      // Provide nodeId to instance (explicit init per project rules)
      try {
        created.init({ nodeId: node.id });
      } catch (e) {
        this.logger.error('Failed to init node instance with nodeId=%s', node.id, e);
      }
      // Attach status_changed forwarder
      this.attachNodeStatusForwarder(node.id, created);

      if (node.data.config) {
        const resolvedConfig = await this.resolveNodeConfig(node.id, node.data.config);
        await created.setConfig(resolvedConfig);
        live.config = resolvedConfig;
      }
      await created.setState(node.data.state ?? {});
    } catch (e) {
      // Factory creation or any init error should include nodeId
      if (e instanceof GraphError) throw e; // already enriched
      throw Errors.nodeInitFailure(node.id, e);
    }
  }

  private attachNodeStatusForwarder(nodeId: string, instance: Node) {
    const handler = (ev: StatusChangedEvent) => {
      for (const l of this.statusListeners) l({ nodeId, prev: ev.prev, next: ev.next, at: ev.at });
    };
    this.nodeStatusHandlers.set(nodeId, handler);
    instance.on('status_changed', handler);
  }

  // Attempt to apply config via setter; if ZodError contains only unrecognized_keys at top-level, strip and retry.
  private async applyConfigWithUnknownKeyStripping(
    instance: {
      setConfig?: (cfg: Record<string, unknown>) => unknown | Promise<unknown>;
      setDynamicConfig?: (cfg: Record<string, unknown>) => unknown | Promise<unknown>;
    },
    method: 'setConfig' | 'setDynamicConfig',
    cfg: Record<string, unknown>,
    nodeId: string,
  ): Promise<Record<string, unknown>> {
    const fn = instance[method];
    if (typeof fn !== 'function') return cfg;

    // Retry unknown-key stripping up to MAX_RETRIES times after the initial failure (total attempts = 1 + MAX_RETRIES)
    let attempt = 0;
    let current = { ...(cfg || {}) } as Record<string, unknown>;
    const MAX_RETRIES = 3; // number of retries, not total attempts
    while (true) {
      try {
        await (fn as (cfg: Record<string, unknown>) => unknown | Promise<unknown>).call(instance, current);
        return current; // success
      } catch (err) {
        if (!(err instanceof ZodError)) {
          throw Errors.configApplyFailed(nodeId, method, err);
        }
        const keys = this.extractUnknownRootKeys(err);
        if (keys.size === 0) {
          throw Errors.configApplyFailed(nodeId, method, err);
        }
        const next = this.pruneKeys(current, keys);
        if (attempt >= MAX_RETRIES) {
          throw Errors.configApplyFailed(nodeId, method, err);
        }
        current = next;
        attempt += 1;
        continue; // retry
      }
    }
  }

  private async resolveNodeConfig(nodeId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.referenceResolver) return config;
    try {
      const { output } = await this.referenceResolver.resolve(config, {
        graphName: this.graphName,
        basePath: `/nodes/${encodeURIComponent(nodeId)}/config`,
      });
      return output;
    } catch (err) {
      if (err instanceof ResolveError) {
        const path = err.path ?? '<unknown>';
        throw new GraphError({
          code: 'REFERENCE_RESOLUTION_ERROR',
          message: `Reference resolution failed for node ${nodeId} at ${path}: ${err.message}`,
          nodeId,
          cause: err,
        });
      }
      throw err;
    }
  }

  // Extract top-level unrecognized keys from a ZodError produced by a config setter
  private extractUnknownRootKeys(err: ZodError): Set<string> {
    const keys = new Set<string>();
    const issues: ZodIssue[] = err.issues || [];
    for (const i of issues) {
      const isUnrec = i && typeof i === 'object' && (i as ZodIssue).code === 'unrecognized_keys';
      if (!isUnrec) continue;
      const path = (i as { path?: unknown }).path as unknown[] | undefined;
      const atRoot = Array.isArray(path) ? path.length === 0 : true;
      if (!atRoot) continue;
      const ks = (i as { keys?: string[] }).keys;
      if (Array.isArray(ks)) for (const k of ks) keys.add(k);
    }
    return keys;
  }

  private pruneKeys(obj: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) if (!keys.has(k)) next[k] = v;
    return next;
  }

  private async disposeNode(nodeId: string): Promise<void> {
    const live = this.state.nodes.get(nodeId);
    if (!live) return;
    // Detach status handler
    const handler = this.nodeStatusHandlers.get(nodeId);
    if (handler) {
      try {
        live.instance.off('status_changed', handler);
      } catch {
        // ignore detach errors during disposal
      }
      this.nodeStatusHandlers.delete(nodeId);
    }
    // Remove outbound & inbound edges referencing this node
    const allEdgeKeys = new Set<string>([
      ...(this.state.inboundEdges.get(nodeId) || []),
      ...(this.state.outboundEdges.get(nodeId) || []),
    ]);
    for (const k of allEdgeKeys) {
      const rec = this.state.executedEdges.get(k);
      if (rec) {
        await this.tryReverseAndUnregister(rec).catch((e) => {
          this.logger.error('Edge reversal during node disposal failed', k, e);
        });
      }
    }
    // Call lifecycle teardown if present
    const inst = live.instance;
    if (inst && typeof inst.deprovision === 'function') {
      try {
        await inst.deprovision();
      } catch {
        // ignore teardown errors
      }
    }
    this.state.nodes.delete(nodeId);
    this.state.inboundEdges.delete(nodeId);
    this.state.outboundEdges.delete(nodeId);
  }

  /** Attempt edge reversal (if supported) and unregister. Logs handled by caller. */
  private async tryReverseAndUnregister(rec: ExecutedEdgeRecord): Promise<void> {
    if (rec.reversible && rec.reversal) await rec.reversal();
    this.unregisterEdgeRecord(rec);
  }

  private registerEdgeRecord(rec: ExecutedEdgeRecord) {
    this.state.executedEdges.set(rec.key, rec);
    if (!this.state.outboundEdges.has(rec.source)) this.state.outboundEdges.set(rec.source, new Set());
    if (!this.state.inboundEdges.has(rec.target)) this.state.inboundEdges.set(rec.target, new Set());
    this.state.outboundEdges.get(rec.source)!.add(rec.key);
    this.state.inboundEdges.get(rec.target)!.add(rec.key);
  }
  private unregisterEdgeRecord(rec: ExecutedEdgeRecord) {
    this.state.executedEdges.delete(rec.key);
    this.state.outboundEdges.get(rec.source)?.delete(rec.key);
    this.state.inboundEdges.get(rec.target)?.delete(rec.key);
  }

  private async executeEdge(edge: EdgeDef, _graph: GraphDefinition): Promise<void> {
    const sourceLive = this.state.nodes.get(edge.source);
    const targetLive = this.state.nodes.get(edge.target);
    if (!sourceLive || !targetLive) return; // node creation error previously logged

    // Resolve via ports registry (fallback to legacy reflection if absent)
    const resolved = this.resolveEdgeWithPorts(edge, sourceLive.template, targetLive.template);
    if (!resolved) return; // legacy fallback failed quietly

    const methodSide = resolved.callableSide === 'source' ? sourceLive : targetLive;
    const methodPort = resolved.methodPort;
    const instanceSide = resolved.callableSide === 'source' ? targetLive : sourceLive;
    const methodCfg = methodPort.config;
    if (methodCfg.kind !== 'method') return; // should not happen after validation

    const argValue = instanceSide.instance; // basic rule: pass the other instance
    const key = edgeKey(edge);

    type Callable = (arg: unknown) => unknown | Promise<unknown>;
    const getMethod = (inst: object, name?: string): Callable | undefined => {
      if (!name) return undefined;
      const rec = inst as Record<string, unknown>;
      const cand = rec[name];
      return typeof cand === 'function' ? (cand as Callable) : undefined;
    };

    const createFn = getMethod(methodSide.instance, methodCfg.create);
    if (createFn) await createFn.call(methodSide.instance, argValue);

    const record: ExecutedEdgeRecord = {
      key,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      reversible: true,
      argumentSnapshot: argValue,
      reversal: async () => {
        const destroyFn = getMethod(methodSide.instance, methodCfg.destroy);
        if (destroyFn) await destroyFn.call(methodSide.instance, argValue);
        else {
          const c = getMethod(methodSide.instance, methodCfg.create);
          if (c) await c.call(methodSide.instance, undefined);
        }
      },
    };
    this.registerEdgeRecord(record);
  }

  private resolveEdgeWithPorts(edge: EdgeDef, sourceTemplate: string, targetTemplate: string) {
    return this.portsRegistry.resolveEdge(edge, sourceTemplate, targetTemplate);
  }
  // Stop and delete all live nodes that implement lifecycle; ignore errors and always clear state
  async shutdown(): Promise<void> {
    const nodes = Array.from(this.state.nodes.values());
    await Promise.all(
      nodes.map(async (live) => {
        const inst = live.instance;
        await inst.deprovision();

        const inbound = this.state.inboundEdges.get(live.id) || new Set<string>();
        const outbound = this.state.outboundEdges.get(live.id) || new Set<string>();
        const all = new Set<string>([...inbound, ...outbound]);
        for (const key of all) {
          const rec = this.state.executedEdges.get(key);
          if (rec) this.unregisterEdgeRecord(rec);
        }
        this.state.nodes.delete(live.id);
        this.state.inboundEdges.delete(live.id);
        this.state.outboundEdges.delete(live.id);
      }),
    );
    this.state.executedEdges.clear();
  }
}
