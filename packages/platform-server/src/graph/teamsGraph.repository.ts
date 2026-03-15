import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/services/prisma.service';
import type {
  PersistedGraph,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../shared/types/graph.types';
import type { GraphAuthor } from './graph.repository';
import { GraphRepository } from './graph.repository';
import { TeamsGraphSource } from './teamsGraph.source';

type PersistedNodeState = Record<string, unknown>;

const readNodeState = (value: unknown): PersistedNodeState | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as PersistedNodeState;
};

@Injectable()
export class TeamsGraphRepository extends GraphRepository {
  constructor(
    @Inject(TeamsGraphSource) private readonly teamsSource: TeamsGraphSource,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {
    super();
  }

  async initIfNeeded(): Promise<void> {
    return;
  }

  async get(name: string): Promise<PersistedGraph | null> {
    if (name !== 'main') return null;
    const snapshot = await this.teamsSource.load();
    if (snapshot.nodes.length === 0 && snapshot.edges.length === 0) {
      return null;
    }

    const prisma = this.prismaService.getClient();
    const [states, variables] = await Promise.all([
      prisma.graphNodeState.findMany(),
      prisma.graphVariable.findMany(),
    ]);

    const stateByNodeId = new Map<string, PersistedNodeState>();
    for (const entry of states) {
      const state = readNodeState(entry.state);
      if (!state) continue;
      stateByNodeId.set(entry.nodeId, state);
    }

    const nodes = snapshot.nodes.map((node) => {
      const state = stateByNodeId.get(node.id);
      if (!state) return node;
      return { ...node, state };
    });

    return {
      name,
      version: 0,
      updatedAt: new Date().toISOString(),
      nodes,
      edges: snapshot.edges,
      variables: variables.map((variable) => ({ key: variable.key, value: variable.value })),
    } satisfies PersistedGraph;
  }

  async upsert(
    _req: PersistedGraphUpsertRequest,
    _author?: GraphAuthor,
  ): Promise<PersistedGraphUpsertResponse> {
    const err = new Error('Graph persistence is disabled') as Error & { code?: string };
    err.code = 'GRAPH_READ_ONLY';
    throw err;
  }

  async upsertNodeState(_name: string, nodeId: string, patch: Record<string, unknown>): Promise<void> {
    const prisma = this.prismaService.getClient();
    await prisma.graphNodeState.upsert({
      where: { nodeId },
      update: { state: patch },
      create: { nodeId, state: patch },
    });
  }
}
