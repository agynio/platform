import { Collection, Db } from 'mongodb';
import { LoggerService } from '../core/services/logger.service';
import { TemplateRegistry } from './templateRegistry';
import { PersistedGraph, PersistedGraphEdge, PersistedGraphNode, PersistedGraphUpsertRequest, PersistedGraphUpsertResponse } from '../graph/types';
import { validatePersistedGraph } from './graphSchema.validator';
import { GraphService } from './graph.service';

interface GraphDocument {
  _id: string; // name
  version: number;
  updatedAt: Date;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}

export class MongoGraphService extends GraphService {
  // Kept for backward-compat when GRAPH_STORE=mongo
  private collection?: Collection<GraphDocument>;
  // Stateless service: persistence only and template exposure.
  // Single-graph endpoint shape expected at /graph/nodes/:nodeId for runtime actions (handled elsewhere).

  constructor(
    private readonly db: Db,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    super();
    this.collection = this.db.collection<GraphDocument>('graphs');
  }

  async initIfNeeded(): Promise<void> {}

  async get(name: string): Promise<PersistedGraph | null> {
    const doc = await this.collection!.findOne({ _id: name });
    if (!doc) return null;
    return this.toPersisted(doc);
  }

  async upsert(req: PersistedGraphUpsertRequest, _author?: { name?: string; email?: string }): Promise<PersistedGraphUpsertResponse> {
    validatePersistedGraph(req, this.templateRegistry.toSchema());
    const now = new Date();
    const name = req.name;
    const existing = await this.collection!.findOne({ _id: name });
    if (!existing) {
      const doc: GraphDocument = {
        _id: name,
        version: 1,
        updatedAt: now,
        nodes: req.nodes.map(this.stripInternalNode),
        edges: req.edges.map(this.stripInternalEdge),
      };
      await this.collection!.insertOne(doc);
      return this.toPersisted(doc);
    }
    // optimistic lock check
    if (req.version !== undefined && req.version !== existing.version) {
      const err: any = new Error('Version conflict');
      err.code = 'VERSION_CONFLICT';
      err.current = this.toPersisted(existing);
      throw err;
    }
    const updated: GraphDocument = {
      _id: name,
      version: existing.version + 1,
      updatedAt: now,
      // Preserve existing node.state when omitted in payload
      nodes: req.nodes.map((n) => {
        const out = this.stripInternalNode(n);
        if (out.state === undefined) {
          const prev = existing.nodes.find((p) => p.id === out.id);
          if (prev && prev.state !== undefined) out.state = prev.state;
        }
        return out;
      }),
      edges: req.edges.map(this.stripInternalEdge),
    };
    await this.collection!.replaceOne({ _id: name }, updated);
    return this.toPersisted(updated);
  }

  // Upsert partial state for a single node without altering other fields
  async upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void> {
    const current = await this.get(name);
    const base = current ?? { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
    const nodes = Array.from(base.nodes || []);
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) nodes[idx] = { ...nodes[idx], state: patch } as PersistedGraphNode;
    else nodes.push({ id: nodeId, template: 'unknown', state: patch } as PersistedGraphNode);
    await this.upsert({ name, version: base.version, nodes, edges: base.edges });
  }

  // API-like helpers to be wired to HTTP in a follow-up
  // Endpoints should reflect single-graph model, e.g., /graph/nodes/:nodeId for runtime actions (handled elsewhere)
  getTemplates() {
    return this.templateRegistry.toSchema();
  }

  // Validation moved to graph.validation.ts to share with GitGraphService

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    // Preserve dynamicConfig so it round-trips through persistence.
    return { id: n.id, template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, state: n.state, position: n.position };
  }
  private stripInternalEdge(e: PersistedGraphEdge): PersistedGraphEdge {
    return { source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, id: e.id };
  }

  private toPersisted(doc: GraphDocument): PersistedGraph {
    return {
      name: doc._id,
      version: doc.version,
      updatedAt: doc.updatedAt.toISOString(),
      nodes: doc.nodes,
      edges: doc.edges,
    };
  }
}
