// Re-export selected shared types from server graph layer to avoid duplication
export type {
  TemplateNodeSchema,
  PersistedGraph,
  PersistedGraphNode,
  PersistedGraphEdge,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../../platform-server/src/shared/types/graph.types';

export type {
  SecretRef,
  VariableRef,
  Reference,
  ReferenceSource,
  ReferenceValue,
  ResolutionEvent,
  ResolutionReport,
  ResolutionEventSource,
  ResolutionErrorCode,
} from './references';
