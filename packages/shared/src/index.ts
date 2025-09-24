// Re-export selected shared types from server graph layer to avoid duplication
export type {
  TemplateNodeSchema,
  PersistedGraph,
  PersistedGraphNode,
  PersistedGraphEdge,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../../../apps/server/src/graph/types';

// Runtime capability foundation exports (no runtime behavior)
export type { ConfigSchema, ProvisionStateDetails } from './runtime.types';
export { ProvisionState } from './runtime.types';
export type { StaticConfigurable, DynamicConfigurable, Provisionable, Pausable } from './runtime.types';
