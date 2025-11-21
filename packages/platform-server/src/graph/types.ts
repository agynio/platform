// Palette schema types (capabilities/staticConfigSchema removed per Issue #451)
// Core graph type declarations are re-exported from the shared types package.

import type { GraphBuildResult as SharedGraphBuildResult, GraphErrorDetails } from '../shared/types/graph.types';

export type {
  GraphDefinition,
  NodeDef,
  EdgeDef,
  DependencyBag,
  FactoryContext,
  Configurable,
  FactoryFn,
  TemplateRegistryLike,
  EndpointType,
  EndpointBase,
  MethodEndpoint,
  PropertyEndpoint,
  SelfEndpoint,
  Endpoint,
  GraphBuilderOptions,
  GraphErrorDetails,
  GraphBuildResult,
  TemplateKind,
  TemplateNodeSchema,
  PersistedGraphNode,
  PersistedGraphEdge,
  PersistedGraph,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../shared/types/graph.types';

export class GraphError extends Error implements GraphErrorDetails {
  code: string;
  nodeId?: string | undefined;
  edgeIndex?: number | undefined;
  handle?: string | undefined;
  template?: string | undefined;
  cause?: unknown;
  constructor(details: GraphErrorDetails) {
    super(details.message);
    this.name = 'GraphError';
    this.code = details.code;
    this.nodeId = details.nodeId;
    this.edgeIndex = details.edgeIndex;
    this.handle = details.handle;
    this.template = details.template;
    this.cause = details.cause;
  }
}

export type BuildResult = SharedGraphBuildResult<GraphError>;
