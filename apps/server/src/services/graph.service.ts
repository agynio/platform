import { Collection, Db } from 'mongodb';
import { LoggerService } from './logger.service';
import { TemplateRegistry } from '../graph/templateRegistry';
import {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
  TemplateNodeSchema,
} from '../graph/types';

interface GraphDocument {
  _id: string; // name
  version: number;
  updatedAt: Date;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}

export class GraphService {
  private collection?: Collection<GraphDocument>;
  // Stateless service: persistence only and template exposure.
  // Single-graph endpoint shape expected at /graph/nodes/:nodeId for runtime actions (handled elsewhere).

  constructor(
    private readonly db: Db,
    private readonly logger: LoggerService,
    private readonly templateRegistry: TemplateRegistry,
  ) {
    this.collection = this.db.collection<GraphDocument>('graphs');
  }


  async get(name: string): Promise<PersistedGraph | null> {
    const doc = await this.collection!.findOne({ _id: name });
    if (!doc) return null;
    return this.toPersisted(doc);
  }

  async upsert(req: PersistedGraphUpsertRequest): Promise<PersistedGraphUpsertResponse> {
    const schema = this.templateRegistry.toSchema();
    this.validate(req, schema);
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
      nodes: req.nodes.map(this.stripInternalNode),
      edges: req.edges.map(this.stripInternalEdge),
    };
    await this.collection!.replaceOne({ _id: name }, updated);
    return this.toPersisted(updated);
  }

  // API-like helpers to be wired to HTTP in a follow-up
  // Endpoints should reflect single-graph model, e.g., /graph/nodes/:nodeId for runtime actions (handled elsewhere)
  getTemplates() {
    return this.templateRegistry.toSchema();
  }

  private validate(req: PersistedGraphUpsertRequest, schema: TemplateNodeSchema[]) {
    const templateSet = new Set(schema.map((s) => s.name));
    const schemaMap = new Map(schema.map((s) => [s.name, s] as const));
    const nodeIds = new Set<string>();
    for (const n of req.nodes) {
      if (!n.id) throw new Error(`Node missing id`);
      if (nodeIds.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
      nodeIds.add(n.id);
      if (!templateSet.has(n.template)) throw new Error(`Unknown template ${n.template}`);
    }
    for (const e of req.edges) {
      if (!nodeIds.has(e.source)) throw new Error(`Edge source missing node ${e.source}`);
      if (!nodeIds.has(e.target)) throw new Error(`Edge target missing node ${e.target}`);
      const sourceNode = req.nodes.find((n) => n.id === e.source)!;
      const targetNode = req.nodes.find((n) => n.id === e.target)!;
      const sourceSchema = schemaMap.get(sourceNode.template)!;
      const targetSchema = schemaMap.get(targetNode.template)!;
      if (!sourceSchema.sourcePorts.includes(e.sourceHandle)) {
        throw new Error(`Invalid source handle ${e.sourceHandle} on template ${sourceNode.template}`);
      }
      if (!targetSchema.targetPorts.includes(e.targetHandle)) {
        throw new Error(`Invalid target handle ${e.targetHandle} on template ${targetNode.template}`);
      }
    }
  }

  private stripInternalNode(n: PersistedGraphNode): PersistedGraphNode {
    return { id: n.id, template: n.template, config: n.config, position: n.position };
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
