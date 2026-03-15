import { Inject, Injectable } from '@nestjs/common';
import type {
  PersistedGraph,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../shared/types/graph.types';
import type { GraphAuthor } from './graph.repository';
import { GraphRepository } from './graph.repository';
import { TeamsGraphSource } from './teamsGraph.source';

@Injectable()
export class TeamsGraphRepository extends GraphRepository {
  constructor(
    @Inject(TeamsGraphSource) private readonly teamsSource: TeamsGraphSource,
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
    return {
      name,
      version: 0,
      updatedAt: new Date().toISOString(),
      nodes: snapshot.nodes,
      edges: snapshot.edges,
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
}
