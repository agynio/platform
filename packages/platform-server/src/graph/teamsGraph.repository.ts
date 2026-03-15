import { Inject, Injectable } from '@nestjs/common';
import type { PersistedGraph } from '../shared/types/graph.types';
import { GraphRepository } from './graph.repository';
import { TeamsGraphSource } from './teamsGraph.source';

@Injectable()
export class TeamsGraphRepository extends GraphRepository {
  constructor(
    @Inject(TeamsGraphSource) private readonly teamsSource: TeamsGraphSource,
  ) {
    super();
  }

  async load(): Promise<PersistedGraph> {
    const snapshot = await this.teamsSource.load();
    return {
      name: 'main',
      version: 0,
      updatedAt: new Date().toISOString(),
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    };
  }
}
