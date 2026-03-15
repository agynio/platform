import type { PersistedGraph } from '../shared/types/graph.types';

export abstract class GraphRepository {
  abstract load(): Promise<PersistedGraph>;
}
