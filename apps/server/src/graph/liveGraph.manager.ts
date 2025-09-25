import {
  ExecutedEdgeRecord,
  GraphDiffResult,
  GraphRuntimeState,
  InternalDiffComputation,
  LiveNode,
  edgeKey,
} from './liveGraph.types';
import { EdgeDef, GraphDefinition, GraphError, NodeDef } from './types';
// Ports based reversible universal edges
import { LoggerService } from '../services/logger.service';
import { Errors } from './errors';
import { PortsRegistry } from './ports.registry';
import { TemplateRegistry } from './templateRegistry';
import type { Pausable, ProvisionStatus, Provisionable, DynamicConfigurable } from './capabilities';

const configsEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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

  get version() {
    return this.state.version;
  }
  getNodes() {
    return Array.from(this.state.nodes.values());
  }
  getExecutedEdges() {
    return Array.from(this.state.executedEdges.values());
  }

  // Return the live node instance (if present)
  getNodeInstance(id: string): unknown {
    return this.state.nodes.get(id)?.instance;
  }

  async apply(graph: GraphDefinition): Promise<GraphDiffResult> {
    this.applying = this.applying.then(() => this._applyGraphInternal(graph));
    return this.applying;
  }

  // Runtime helpers for Pausable/Provisionable
  private hasMethod(o: unknown, name: string): boolean {
    return !!o && typeof (o as Record<string, unknown>)[name] === 'function';
  }
  private isPausable(o: unknown): o is Pausable {
    return this.hasMethod(o, 'pause') && this.hasMethod(o, 'resume');
  }
  private isProvisionable(o: unknown): o is Provisionable {
    return this.hasMethod(o, 'getProvisionStatus') && this.hasMethod(o, 'provision') && this.hasMethod(o, 'deprovision');
  }
  private isDynConfigurable(o: unknown): o is DynamicConfigurable {
    return this.hasMethod(o, 'isDynamicConfigReady');
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
        const fn = (inst as Record<string, unknown>)['isPaused'] as () => unknown;
        out.isPaused = !!fn.call(inst);
      } else {
        out.isPaused = this.pausedFallback.has(id);
      }
      if (this.isProvisionable(inst)) {
        const fn = (inst as Record<string, unknown>)['getProvisionStatus'] as () => unknown;
        out.provisionStatus = fn.call(inst) as ProvisionStatus;
      }
      if (this.isDynConfigurable(inst)) {
        const fn = (inst as Record<string, unknown>)['isDynamicConfigReady'] as () => unknown;
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
        const setter = (live.instance as Record<string, unknown>)['setConfig'];
        if (typeof setter === 'function') await (setter as Function).call(live.instance, nodeDef.data.config || {});
        live.config = nodeDef.data.config || {};
      } catch (e) {
        logger?.error?.('Config update failed', nodeId, e);
        // non-fatal
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
    const prevEdgeMap = new Map(prev.edges.map((e) => [edgeKey(e), e]));
    const nextEdgeMap = new Map(next.edges.map((e) => [edgeKey(e), e]));
    const addedEdges: EdgeDef[] = [];
    const removedEdges: EdgeDef[] = [];
    for (const [k, e] of nextEdgeMap.entries()) if (!prevEdgeMap.has(k)) addedEdges.push(e);
    for (const [k, e] of prevEdgeMap.entries()) if (!nextEdgeMap.has(k)) removedEdges.push(e);

    return { addedNodes, removedNodeIds, recreatedNodeIds, configUpdateNodeIds, addedEdges, removedEdges };
  }

  private async instantiateNode(node: NodeDef): Promise<void> {
    const factory = this.templateRegistry.get(node.data.template);
    if (!factory) throw Errors.unknownTemplate(node.data.template, node.id);
    // Factories receive a minimal context (deps deprecated -> empty object)
    const created = await factory({ deps: {}, get: (id: string) => this.state.nodes.get(id)?.instance, nodeId: node.id });
    // NOTE: setGraphNodeId reflection removed; prefer factories to leverage ctx.nodeId directly.
    const live: LiveNode = { id: node.id, template: node.data.template, instance: created, config: node.data.config };
    this.state.nodes.set(node.id, live);
    if (node.data.config) {
      const setter = (created as Record<string, unknown>)['setConfig'];
      if (typeof setter === 'function') await (setter as Function).call(created, node.data.config);
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
      const createFn = (methodSide.instance as Record<string, unknown>)[methodCfg.create];
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
          const destroyFn = (methodSide.instance as Record<string, unknown>)[methodCfg.destroy];
          if (typeof destroyFn === 'function') await (destroyFn as Function).call(methodSide.instance, argValue);
        } else {
          // Fallback: call create with undefined to signal disconnection
          const createFn = (methodSide.instance as Record<string, unknown>)[methodCfg.create];
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
