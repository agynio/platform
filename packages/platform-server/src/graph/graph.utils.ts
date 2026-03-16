import type { PersistedGraphEdge } from '../shared/types/graph.types';

export const edgeKey = (edge: PersistedGraphEdge): string =>
  `${edge.source}-${edge.sourceHandle}__${edge.target}-${edge.targetHandle}`;
