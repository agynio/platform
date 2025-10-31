import { Collection, Db } from 'mongodb';
import { LoggerService } from '../core/services/logger.service';
import { TemplateRegistry } from './templateRegistry';
import { PersistedGraph, PersistedGraphEdge, PersistedGraphNode, PersistedGraphUpsertRequest, PersistedGraphUpsertResponse } from '../graph/types';
import { validatePersistedGraph } from './graphSchema.validator';
import { GraphRepository } from './graph.repository';
import { ConfigService } from '../core/services/config.service';

interface GraphDocument {
  _id: string; // name
  version: number;
  updatedAt: Date;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
  variables?: Array<{ key: string; value: string }>;
}

export class MongoGraphRepository extends GraphRepository {
  private collection?: Collection<GraphDocument>;
  constructor(
    private readonly db: Db,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async initIfNeeded(): Promise<void> {
    // Lazily initialize collection to avoid constructor side effects.
    const coll = this.config?.graphMongoCollectionName || 'graphs';
    this.collection = this.db.collection<GraphDocument>(coll);
  }

  async get(name: string): Promise<PersistedGraph | null> {
    const doc = await this.collection!.findOne({ _id: name });
    if (!doc) return null;
    return this.toPersisted(doc);
  }

  async upsert(req: PersistedGraphUpsertRequest, _author?: { name?: string; email?: string }): Promise<PersistedGraphUpsertResponse> {
    validatePersistedGraph(req, await this.templateRegistry.toSchema());
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
        variables: req.variables?.map((v) => ({ key: String(v.key), value: String(v.value) })),
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
      // Preserve existing variables when omitted
      variables:
        req.variables === undefined
          ? existing.variables
          : req.variables.map((v) => ({ key: String(v.key), value: String(v.value) })),
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
  async getTemplates() {
    return await this.templateRegistry.toSchema();
  }

  // Validation moved to graph.validation.ts to share with GitGraphRepository

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    // dynamicConfig removed; persist known fields only.
    return { id: n.id, template: n.template, config: n.config, state: n.state, position: n.position };
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
      variables: doc.variables,
    };
  }
}
