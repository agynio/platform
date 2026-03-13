import type {
  PersistedGraph,
  PersistedGraphEdge,
  PersistedGraphNode,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../shared/types/graph.types';
import type { GraphAuthor } from './graph.repository';
import { GraphRepository } from './graph.repository';
import { FsGraphRepository } from './fsGraph.repository';
import type { TeamsGraphSnapshot } from './teamsGraph.source';
import { TeamsGraphSource } from './teamsGraph.source';

export const TEAMS_MANAGED_TEMPLATES = new Set<string>([
  'agent',
  'manageTool',
  'memoryTool',
  'shellTool',
  'sendMessageTool',
  'sendSlackMessageTool',
  'remindMeTool',
  'githubCloneRepoTool',
  'callAgentTool',
  'workspace',
  'mcpServer',
  'memory',
  'memoryConnector',
]);

export class HybridGraphRepository extends GraphRepository {
  constructor(
    private readonly fsRepo: FsGraphRepository,
    private readonly teamsSource: TeamsGraphSource,
  ) {
    super();
  }

  async initIfNeeded(): Promise<void> {
    await this.fsRepo.initIfNeeded();
  }

  async get(name: string): Promise<PersistedGraph | null> {
    const [fsGraph, teamsGraph] = await Promise.all([this.fsRepo.get(name), this.teamsSource.load()]);
    if (!fsGraph && teamsGraph.nodes.length === 0 && teamsGraph.edges.length === 0) {
      return null;
    }
    const base: PersistedGraph = fsGraph ?? {
      name,
      version: 0,
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      variables: [],
    };
    return this.mergeGraphs(base, teamsGraph);
  }

  async upsert(req: PersistedGraphUpsertRequest, author?: GraphAuthor): Promise<PersistedGraphUpsertResponse> {
    return this.fsRepo.upsert(req, author);
  }

  async upsertNodeState(name: string, nodeId: string, patch: Record<string, unknown>): Promise<void> {
    await this.fsRepo.upsertNodeState(name, nodeId, patch);
  }

  private mergeGraphs(base: PersistedGraph, teamsGraph: TeamsGraphSnapshot): PersistedGraph {
    const fsNodesById = new Map<string, PersistedGraphNode>(base.nodes.map((node) => [node.id, node]));
    const teamsNodeIds = new Set(teamsGraph.nodes.map((node) => node.id));
    const nonTeamsNodes = base.nodes.filter(
      (node) => !teamsNodeIds.has(node.id) && !TEAMS_MANAGED_TEMPLATES.has(node.template),
    );
    const mergedTeamsNodes = teamsGraph.nodes.map((node) => this.mergeNode(node, fsNodesById.get(node.id)));
    const nodes = [...nonTeamsNodes, ...mergedTeamsNodes];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = this.mergeEdges(base.edges, teamsGraph.edges, nodeIds, teamsNodeIds);
    return {
      ...base,
      nodes,
      edges,
    };
  }

  private mergeNode(teamsNode: PersistedGraphNode, fsNode?: PersistedGraphNode): PersistedGraphNode {
    const merged: PersistedGraphNode = { ...teamsNode };
    if (merged.state === undefined && fsNode?.state !== undefined) {
      merged.state = fsNode.state;
    }
    if (merged.position === undefined && fsNode?.position !== undefined) {
      merged.position = fsNode.position;
    }
    return merged;
  }

  private mergeEdges(
    fsEdges: PersistedGraphEdge[],
    teamsEdges: PersistedGraphEdge[],
    nodeIds: Set<string>,
    teamsNodeIds: Set<string>,
  ): PersistedGraphEdge[] {
    const edges: PersistedGraphEdge[] = [];
    const seen = new Set<string>();

    const addEdge = (edge: PersistedGraphEdge): void => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
      if (!edge.sourceHandle || !edge.targetHandle) return;
      const key = this.edgeKey(edge);
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ ...edge, id: key });
    };

    for (const edge of fsEdges) {
      if (teamsNodeIds.has(edge.source) && teamsNodeIds.has(edge.target)) continue;
      addEdge(edge);
    }

    for (const edge of teamsEdges) {
      addEdge(edge);
    }

    return edges;
  }

  private edgeKey(edge: PersistedGraphEdge): string {
    return `${edge.source}-${edge.sourceHandle}__${edge.target}-${edge.targetHandle}`;
  }
}
