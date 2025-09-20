import { TemplateRegistryLike, HandleRegistryLike, GraphDefinition, GraphError, NodeDef, EdgeDef } from './types';
import {
  ExecutedEdgeRecord,
  GraphRuntimeState,
  LiveGraphOptions,
  LiveNode,
  GraphDiffResult,
  InternalDiffComputation,
  edgeKey,
} from './liveGraph.types';
// Ports based reversible universal edges
import { PortsRegistry } from './ports.registry';
import { TemplatePortsRegistry, ResolvedEdgePorts } from './ports.types';
import { Errors } from './errors';

// Lightweight helper to deep compare configs (could swap with faster hash later)
const configsEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b); // eslint-disable-line @typescript-eslint/no-explicit-any

export class LiveGraphRuntime {
  private state: GraphRuntimeState = {
    nodes: new Map(),
    executedEdges: new Map(),
    inboundEdges: new Map(),
    outboundEdges: new Map(),
    version: 0,
    lastGraph: undefined,
  };

  private applying: Promise<any> = Promise.resolve(); // serialize updates
  private portsRegistry: PortsRegistry;

  constructor(
    private readonly templateRegistry: TemplateRegistryLike,
    private readonly handleRegistry: HandleRegistryLike,
    private readonly deps: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    private readonly options: LiveGraphOptions = {},
    portsMap: TemplatePortsRegistry = {},
  ) {
    this.portsRegistry = new PortsRegistry(portsMap);
  }

  get version() { return this.state.version; }
  getNodes() { return Array.from(this.state.nodes.values()); }
  getExecutedEdges() { return Array.from(this.state.executedEdges.values()); }

  async init(graph: GraphDefinition): Promise<GraphDiffResult> {
    // Build from empty state
    return this.applyGraph(graph);
  }

  async applyGraph(nextGraph: GraphDefinition): Promise<GraphDiffResult> {
    this.applying = this.applying.then(() => this._applyGraphInternal(nextGraph));
    return this.applying;
  }

  private async _applyGraphInternal(next: GraphDefinition): Promise<GraphDiffResult> {
    const prev = this.state.lastGraph ?? { nodes: [], edges: [] } as GraphDefinition;
    const diff = this.computeDiff(prev, next);
    const errors: GraphError[] = [];
    const continueOnError = this.options.continueOnError ?? false;
    const logger = this.options.logger;
    const pushError = (err: GraphError) => {
      errors.push(err);
      if (!continueOnError) throw err;
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
      const nodeDef = next.nodes.find(n => n.id === nodeId)!;
      try {
        await this.instantiateNode(nodeDef);
      } catch (e) {
        pushError(e as GraphError);
      }
    }

    // 2. Config updates
    for (const nodeId of diff.configUpdateNodeIds) {
      const nodeDef = next.nodes.find(n => n.id === nodeId)!;
      const live = this.state.nodes.get(nodeId);
      if (!live) continue;
      if (live.instance && typeof live.instance.setConfig === 'function') {
        try {
          await live.instance.setConfig(nodeDef.data.config || {});
          live.config = nodeDef.data.config || {};
          this.options.onConfigUpdated?.(live);
        } catch (e) {
          logger?.error?.('Config update failed', nodeId, e);
          // pushError not fatal unless required
        }
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
          this.options.onEdgeRemoved?.(rec);
        } catch (e) {
          logger?.warn?.('Edge reversal failed', key, e);
          // continue
        }
      }
    }

    // 4. Remove nodes (and any residual edges referencing them)
    for (const nodeId of diff.removedNodeIds) {
      await this.disposeNode(nodeId).catch(err => pushError(err as GraphError));
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
      addedNodes: diff.addedNodes.map(n => n.id),
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
    const prevNodes = new Map(prev.nodes.map(n => [n.id, n]));
    const nextNodes = new Map(next.nodes.map(n => [n.id, n]));
    const addedNodes: NodeDef[] = [];
    const removedNodeIds: string[] = [];
    const recreatedNodeIds: string[] = [];
    const configUpdateNodeIds: string[] = [];

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
            if (!configsEqual(prevCfg, nextCfg)) {
              configUpdateNodeIds.push(n.id);
            }
        }
      }
    }
    for (const old of prev.nodes) {
      if (!nextNodes.has(old.id)) removedNodeIds.push(old.id);
    }

    // Edges
    const prevEdgeMap = new Map(prev.edges.map(e => [edgeKey(e), e]));
    const nextEdgeMap = new Map(next.edges.map(e => [edgeKey(e), e]));
    const addedEdges: EdgeDef[] = [];
    const removedEdges: EdgeDef[] = [];
    for (const [k, e] of nextEdgeMap.entries()) if (!prevEdgeMap.has(k)) addedEdges.push(e);
    for (const [k, e] of prevEdgeMap.entries()) if (!nextEdgeMap.has(k)) removedEdges.push(e);

    return { addedNodes, removedNodeIds, recreatedNodeIds, configUpdateNodeIds, addedEdges, removedEdges };
  }

  private async instantiateNode(node: NodeDef): Promise<void> {
    const factory = this.templateRegistry.get(node.data.template);
    if (!factory) throw Errors.unknownTemplate(node.data.template, node.id);
    const created = await factory({ deps: this.deps, get: (id: string) => this.state.nodes.get(id)?.instance });
    const live: LiveNode = { id: node.id, template: node.data.template, instance: created, config: node.data.config };
    this.state.nodes.set(node.id, live);
    if (node.data.config && created && typeof (created as any).setConfig === 'function') { // eslint-disable-line @typescript-eslint/no-explicit-any
      await (created as any).setConfig(node.data.config); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    this.options.onNodeAdded?.(live);
  }

  private async disposeNode(nodeId: string): Promise<void> {
    const live = this.state.nodes.get(nodeId);
    if (!live) return;
    // Remove outbound & inbound edges referencing this node
    const allEdgeKeys = new Set<string>([...(this.state.inboundEdges.get(nodeId) || []), ...(this.state.outboundEdges.get(nodeId) || [])]);
    for (const k of allEdgeKeys) {
      const rec = this.state.executedEdges.get(k);
      if (rec) {
        // Attempt reversal if reversible
        try {
          if (rec.reversible && rec.reversal) await rec.reversal();
        } catch (e) {
          this.options.logger?.warn?.('Edge reversal during node disposal failed', k, e);
        }
        this.unregisterEdgeRecord(rec);
        this.options.onEdgeRemoved?.(rec);
      }
    }
    // Call lifecycle teardown if present
    const inst: any = live.instance; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (inst) {
      if (typeof inst.destroy === 'function') {
        try { await inst.destroy(); } catch { /* ignore */ }
      } else {
        // fallback legacy
        for (const method of ['dispose', 'close', 'stop']) {
          if (typeof inst[method] === 'function') {
            try { await inst[method](); } catch { /* ignore */ }
            break;
          }
        }
      }
    }
    this.state.nodes.delete(nodeId);
    this.state.inboundEdges.delete(nodeId);
    this.state.outboundEdges.delete(nodeId);
    this.options.onNodeRemoved?.(nodeId);
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

    await (methodSide.instance as any)[methodCfg.create](argValue); // eslint-disable-line @typescript-eslint/no-explicit-any

    const record: ExecutedEdgeRecord = {
      key,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      reversible: true,
      argumentSnapshot: argValue,
      reversal: async () => {
        await (methodSide.instance as any)[methodCfg.destroy](argValue); // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    };
    this.registerEdgeRecord(record);
    this.options.onEdgeExecuted?.(record);
  }

  // Simplified endpoint resolution (duplicate logic with builder; could DRY later)
  private resolveEndpoint(instance: any, template: string, handle: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (handle === '$self') return { type: 'self', owner: instance };
    if (handle in instance) {
      const value = instance[handle];
      if (typeof value === 'function') return { type: 'method', key: handle, fn: value, owner: instance };
      return { type: 'property', key: handle, owner: instance };
    }
    const reg = this.handleRegistry.resolve(instance, template, handle);
    return reg;
  }

  private extractArg(endpoint: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (endpoint.type) {
      case 'self': return endpoint.owner;
      case 'property': return endpoint.owner[endpoint.key];
      default: return undefined;
    }
  }

  private resolveEdgeWithPorts(edge: EdgeDef, sourceTemplate: string, targetTemplate: string) {
    return this.portsRegistry.resolveEdge(edge, sourceTemplate, targetTemplate, () => undefined);
  }
}
