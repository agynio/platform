import {
  ExecutedEdgeRecord,
  GraphDiffResult,
  GraphRuntimeState,
  InternalDiffComputation,
  LiveNode,
  edgeKey,
} from './liveGraph.types';
import { EdgeDef, GraphDefinition, GraphError, NodeDef, DependencyBag } from './types';
// Ports based reversible universal edges
import { LoggerService } from '../services/logger.service';
import { Errors } from './errors';
import { PortsRegistry } from './ports.registry';
import { TemplateRegistry } from './templateRegistry';
import type { Pausable, ProvisionStatus, Provisionable, DynamicConfigurable } from './capabilities';
import { hasSetConfig, hasSetDynamicConfig, isDynamicConfigurable } from './capabilities';
import { ZodError } from 'zod';

const configsEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b); // unchanged

export class LiveGraphRuntime {
  private state: GraphRuntimeState = {
    nodes: new Map(),
    executedEdges: new Map(),
    inboundEdges: new Map(),
    outboundEdges: new Map(),
    version: 0,
    lastGraph: undefined,
  };

  // Track paused state for nodes that don't implement isPaused()
  private pausedFallback = new Set<string>();

  private applying: Promise<unknown> = Promise.resolve(); // serialize updates
  private portsRegistry: PortsRegistry;

  constructor(
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    this.portsRegistry = new PortsRegistry(this.templateRegistry.getPortsMap());
  }

  // Optional global deps bag exposed to factories and post-instantiation hooks
  private factoryDeps: DependencyBag = {};
  setFactoryDeps(deps: DependencyBag) {
    this.factoryDeps = deps || {};
  }

  get version() {
    return this.state.version;
  }
  getNodes() {
    return Array.from(this.state.nodes.values());
  }
  getExecutedEdges() {
    return Array.from(this.state.executedEdges.values());
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

  // Return the live node instance (if present). Authoritative API used by routes (no any casts).
  getNodeInstance<T = unknown>(id: string): T | undefined {
    return this.state.nodes.get(id)?.instance as T | undefined;
  }

  async apply(graph: GraphDefinition): Promise<GraphDiffResult> {
    this.applying = this.applying.then(() => this._applyGraphInternal(graph));
    return this.applying as Promise<GraphDiffResult>;
  }

  // Runtime helpers for Pausable/Provisionable
  private hasMethod(o: unknown, name: string): boolean {
    return !!o && typeof (o as Record<string, unknown>)[name] === 'function';
  }
  private isPausable(o: unknown): o is Pausable {
    return this.hasMethod(o, 'pause') && this.hasMethod(o, 'resume');
  }
  private isProvisionable(o: unknown): o is Provisionable {
    return (
      this.hasMethod(o, 'getProvisionStatus') && this.hasMethod(o, 'provision') && this.hasMethod(o, 'deprovision')
    );
  }
  private isDynConfigurable(o: unknown): o is DynamicConfigurable {
    return isDynamicConfigurable(o);
  }

  async pauseNode(id: string): Promise<void> {
    const inst = this.state.nodes.get(id)?.instance as unknown;
    if (this.isPausable(inst)) await inst.pause();
    else this.pausedFallback.add(id);
  }
  async resumeNode(id: string): Promise<void> {
    const inst = this.state.nodes.get(id)?.instance as unknown;
    if (this.isPausable(inst)) await inst.resume();
    else this.pausedFallback.delete(id);
  }
  async provisionNode(id: string): Promise<void> {
    const inst = this.state.nodes.get(id)?.instance as unknown;
    if (this.isProvisionable(inst)) await inst.provision();
  }
  async deprovisionNode(id: string): Promise<void> {
    const inst = this.state.nodes.get(id)?.instance as unknown;
    if (this.isProvisionable(inst)) await inst.deprovision();
  }
  getNodeStatus(id: string): { isPaused?: boolean; provisionStatus?: ProvisionStatus; dynamicConfigReady?: boolean } {
    const inst = this.state.nodes.get(id)?.instance as unknown;
    const out: { isPaused?: boolean; provisionStatus?: ProvisionStatus; dynamicConfigReady?: boolean } = {};
    if (inst) {
      if (this.hasMethod(inst, 'isPaused')) {
        const fn = (inst as any)['isPaused'] as () => unknown; // dynamic reflection
        out.isPaused = !!fn.call(inst);
      } else {
        out.isPaused = this.pausedFallback.has(id);
      }
      if (this.isProvisionable(inst)) {
        const fn = (inst as any)['getProvisionStatus'] as () => unknown;
        out.provisionStatus = fn.call(inst) as ProvisionStatus;
      }
      if (this.isDynConfigurable(inst)) {
        const fn = (inst as any)['isDynamicConfigReady'] as () => unknown;
        out.dynamicConfigReady = !!fn.call(inst);
      }
    } else {
      out.isPaused = this.pausedFallback.has(id);
    }
    return out;
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
    for (const nodeId of diff.configUpdateNodeIds) {
      const nodeDef = next.nodes.find((n) => n.id === nodeId)!;
      const live = this.state.nodes.get(nodeId);
      if (!live) continue;
      try {
        if (hasSetConfig(live.instance)) {
          const cfg = nodeDef.data.config || {};
          const cleaned = await this.applyConfigWithUnknownKeyStripping(live.instance, 'setConfig', cfg, nodeId);
          // set live.config to cleaned object only on success
          live.config = cleaned;
        }
      } catch (e) {
        logger?.error?.('Config update failed (setConfig)', nodeId, e);
        // non-fatal
      }
    }
    // 2b. Dynamic config updates
    for (const nodeId of diff.dynamicConfigUpdateNodeIds || []) {
      const nodeDef = next.nodes.find((n) => n.id === nodeId)!;
      const live = this.state.nodes.get(nodeId);
      if (!live) continue;
      try {
        if (hasSetDynamicConfig(live.instance)) {
          await this.applyConfigWithUnknownKeyStripping(
            live.instance,
            'setDynamicConfig',
            nodeDef.data.dynamicConfig || {},
            nodeId,
          );
        }
      } catch (e) {
        logger?.error?.('Config update failed (setDynamicConfig)', nodeId, e);
      }
    }

    // 3. Remove edges (reverse if needed) BEFORE removing nodes
    for (const rem of diff.removedEdges) {
      const key = edgeKey(rem);
      const rec = this.state.executedEdges.get(key);
      if (rec) {
        try {
          if (rec.reversible && rec.reversal) await rec.reversal();
          this.unregisterEdgeRecord(rec);
        } catch (e) {
          logger.error('Edge reversal failed', key, e);
          // continue
        }
      }
    }

    // 4. Remove nodes (and any residual edges referencing them)
    for (const nodeId of diff.removedNodeIds) {
      await this.disposeNode(nodeId).catch((err) => pushError(err as GraphError));
    }

    // 5. Add edges
    for (const edge of diff.addedEdges) {
      try {
        await this.executeEdge(edge, next);
      } catch (e) {
        pushError(e as GraphError);
      }
    }

    // 6. Update state metadata
    this.state.version += 1;
    this.state.lastGraph = next;

    const result: GraphDiffResult = {
      addedNodes: diff.addedNodes.map((n) => n.id),
      removedNodes: diff.removedNodeIds,
      recreatedNodes: diff.recreatedNodeIds,
      updatedConfigNodes: diff.configUpdateNodeIds,
      updatedDynamicConfigNodes: (diff as any).dynamicConfigUpdateNodeIds || [],
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
  const dynamicConfigUpdateNodeIds: string[] = [];

    // Nodes
    for (const n of next.nodes) {
      if (!prevNodes.has(n.id)) {
        addedNodes.push(n);
      } else {
        const prevNode = prevNodes.get(n.id)!;
        if (prevNode.data.template !== n.data.template) {
          recreatedNodeIds.push(n.id);
        } else {
          const prevCfg = prevNode.data.config || {};
          const nextCfg = n.data.config || {};
          if (!configsEqual(prevCfg, nextCfg)) configUpdateNodeIds.push(n.id);
          const prevDyn = (prevNode.data as any).dynamicConfig || {};
          const nextDyn = (n.data as any).dynamicConfig || {};
          if (!configsEqual(prevDyn, nextDyn)) dynamicConfigUpdateNodeIds.push(n.id);
        }
      }
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

    return { addedNodes, removedNodeIds, recreatedNodeIds, configUpdateNodeIds, dynamicConfigUpdateNodeIds, addedEdges, removedEdges } as any;
  }

  private async instantiateNode(node: NodeDef): Promise<void> {
    try {
      const factory = this.templateRegistry.get(node.data.template);
      if (!factory) throw Errors.unknownTemplate(node.data.template, node.id);
      // Factories receive a minimal context (deps deprecated -> empty object)
      const created = await factory({
        deps: this.factoryDeps,
        get: (id: string) => this.state.nodes.get(id)?.instance,
        nodeId: node.id,
      });
      // NOTE: setGraphNodeId reflection removed; prefer factories to leverage ctx.nodeId directly.
      const live: LiveNode = { id: node.id, template: node.data.template, instance: created, config: node.data.config };
      this.state.nodes.set(node.id, live);

      // Post-create wiring: provide state persistor and preload cached MCP tools if present
      try {
        const instAny = created as any;
        // Provide per-node state persistor if instance supports it and we have a graphStateService
        const deps = this.factoryDeps as { graphStateService?: { upsertNodeState: (nodeId: string, state: Record<string, unknown>) => Promise<void> }; configService?: { mcpToolsStaleTimeoutMs?: number } };
        if (instAny && typeof instAny.setStatePersistor === 'function' && deps.graphStateService) {
          const svc = deps.graphStateService;
          instAny.setStatePersistor(async (state: Record<string, unknown>) => {
            await svc.upsertNodeState(node.id, state);
          });
        }
        // Preload cached MCP tools if instance supports it and state contains mcp tools
        const st = node.data.state as { mcp?: { tools?: unknown[]; toolsUpdatedAt?: number | string } } | undefined;
        if (st?.mcp && Array.isArray(st.mcp.tools) && typeof instAny?.preloadCachedTools === 'function') {
          instAny.preloadCachedTools(st.mcp.tools, st.mcp.toolsUpdatedAt);
        }
        // Pass global MCP stale timeout if provided via deps.configService
        if (typeof instAny?.setGlobalStaleTimeoutMs === 'function' && deps?.configService) {
          const ms = Number(deps.configService.mcpToolsStaleTimeoutMs ?? 0);
          instAny.setGlobalStaleTimeoutMs(Number.isFinite(ms) ? ms : 0);
        }
      } catch (e) {
        this.logger.debug('Post-create wiring failed', e);
      }
      if (node.data.config) {
        if (hasSetConfig(created)) {
          try {
            const cleaned = await this.applyConfigWithUnknownKeyStripping(created, 'setConfig', node.data.config, node.id);
            if (cleaned) live.config = cleaned;
          } catch (err) {
            throw Errors.nodeInitFailure(node.id, err);
          }
        }
      }
      if (node.data.dynamicConfig) {
        if (hasSetDynamicConfig(created)) {
          try {
            await this.applyConfigWithUnknownKeyStripping(created, 'setDynamicConfig', node.data.dynamicConfig, node.id);
          } catch (err) {
            throw Errors.nodeInitFailure(node.id, err);
          }
        }
      }
    } catch (e) {
      // Factory creation or any init error should include nodeId
      if (e instanceof GraphError) throw e; // already enriched
      throw Errors.nodeInitFailure(node.id, e);
    }
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
        await (fn as Function).call(instance, current);
        return current; // success
      } catch (err) {
        if (err instanceof ZodError) {
          const issues = err.issues || [];
          const unknownRoot = issues.filter((i: unknown) => {
            const z: any = i as any;
            if (!z || typeof z !== 'object') return false;
            if (z.code !== 'unrecognized_keys') return false;
            const hasKeys = Array.isArray(z.keys as unknown[]);
            const path = z.path as unknown;
            const pathOk = Array.isArray(path as unknown[]) ? (path as unknown[]).length === 0 : true;
            return hasKeys && pathOk;
          });
          if (unknownRoot.length > 0) {
            const keys = new Set<string>();
              for (const i of unknownRoot) for (const k of (i as any).keys as string[]) keys.add(k);
            if (keys.size > 0) {
              const next: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(current)) if (!keys.has(k)) next[k] = v;
              current = next;
              if (attempt < MAX_RETRIES) {
                attempt += 1;
                continue; // retry
              }
            }
          }
        }
        // Not an unknown keys case or retries exhausted
        throw Errors.configApplyFailed(nodeId, method, err);
      }
    }
  }

  private async disposeNode(nodeId: string): Promise<void> {
    const live = this.state.nodes.get(nodeId);
    if (!live) return;
    // Remove outbound & inbound edges referencing this node
    const allEdgeKeys = new Set<string>([
      ...(this.state.inboundEdges.get(nodeId) || []),
      ...(this.state.outboundEdges.get(nodeId) || []),
    ]);
    for (const k of allEdgeKeys) {
      const rec = this.state.executedEdges.get(k);
      if (rec) {
        // Attempt reversal if reversible
        try {
          if (rec.reversible && rec.reversal) await rec.reversal();
        } catch (e) {
          this.logger.error('Edge reversal during node disposal failed', k, e);
        }
        this.unregisterEdgeRecord(rec);
      }
    }
    // Call lifecycle teardown if present
    const inst = live.instance as unknown;
    if (inst) {
      const destroy = (inst as Record<string, unknown>)['destroy'];
      if (typeof destroy === 'function') {
        try {
          await (destroy as Function).call(inst);
        } catch {}
      } else {
        // fallback legacy
        for (const method of ['dispose', 'close', 'stop'] as const) {
          const fn = (inst as Record<string, unknown>)[method];
          if (typeof fn === 'function') {
            try {
              await (fn as Function).call(inst);
            } catch {}
            break;
          }
        }
      }
    }
    this.state.nodes.delete(nodeId);
    this.state.inboundEdges.delete(nodeId);
    this.state.outboundEdges.delete(nodeId);
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

  private async executeEdge(edge: EdgeDef, graph: GraphDefinition): Promise<void> {
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

    {
      const createFn = (methodSide.instance as any)[methodCfg.create];
      if (typeof createFn === 'function') await (createFn as Function).call(methodSide.instance, argValue);
    }

    const record: ExecutedEdgeRecord = {
      key,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      reversible: true,
      argumentSnapshot: argValue,
      reversal: async () => {
        if (methodCfg.destroy) {
          const destroyFn = (methodSide.instance as any)[methodCfg.destroy];
          if (typeof destroyFn === 'function') await (destroyFn as Function).call(methodSide.instance, argValue);
        } else {
          // Fallback: call create with undefined to signal disconnection
          const createFn = (methodSide.instance as any)[methodCfg.create];
          if (typeof createFn === 'function') await (createFn as Function).call(methodSide.instance, undefined);
        }
      },
    };
    this.registerEdgeRecord(record);
  }

  private resolveEdgeWithPorts(edge: EdgeDef, sourceTemplate: string, targetTemplate: string) {
    return this.portsRegistry.resolveEdge(edge, sourceTemplate, targetTemplate);
  }
}
