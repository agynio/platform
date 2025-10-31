// Palette schema types (capabilities/staticConfigSchema removed per Issue #451)

// Core type declarations for JSON-driven agent/tool/trigger graph construction
export interface GraphDefinition {
  nodes: NodeDef[];
  edges: EdgeDef[];
}

export interface NodeDef {
  id: string;
  data: {
    template: string; // template name registered in TemplateRegistry
    config?: Record<string, unknown>; // optional configuration passed via instance.setConfig
    state?: Record<string, unknown>; // optional persisted runtime state (per-node)
  };
}

export interface EdgeDef {
  source: string; // node id
  sourceHandle: string; // handle name on source instance
  target: string; // node id
  targetHandle: string; // handle name on target instance
}

/**
 * Deprecated: legacy dependency bag previously passed to factories via runtime.
 * Prefer explicit wiring through template factories and constructor params.
 * Kept for backward-compat of type signatures; will be removed in a future release.
 */
export type DependencyBag = Record<string, unknown>;

export interface FactoryContext {
  // Deprecated: deps were previously injected globally; avoid relying on this.
  deps?: DependencyBag;
  get: (id: string) => unknown; // access previously instantiated node (must exist already)
  nodeId: string; // id of the node currently being instantiated (for namespacing / awareness)
}

// All factories must return a Configurable instance that implements setConfig
export interface Configurable {
  setConfig(cfg: Record<string, unknown>): void | Promise<void>;
}

export type FactoryFn = (ctx: FactoryContext) => Configurable | Promise<Configurable>;

export interface TemplateRegistryLike {
  get(template: string): FactoryFn | undefined;
}

export type EndpointType = 'method' | 'property' | 'self';

export interface EndpointBase {
  type: EndpointType;
}

export interface MethodEndpoint extends EndpointBase {
  type: 'method';
  key: string;
  fn: Function;
  owner: unknown;
}

export interface PropertyEndpoint extends EndpointBase {
  type: 'property';
  key: string;
  owner: unknown;
}

export interface SelfEndpoint extends EndpointBase {
  type: 'self';
  owner: unknown;
}

export type Endpoint = MethodEndpoint | PropertyEndpoint | SelfEndpoint;

export interface GraphBuilderOptions {
  continueOnError?: boolean; // if true collects errors and proceeds, else fail-fast
  warnOnMissingSetConfig?: boolean; // log / collect a warning when config provided but setConfig missing
}

export interface GraphErrorDetails {
  code: string;
  message: string;
  nodeId?: string;
  edgeIndex?: number;
  handle?: string;
  template?: string;
  cause?: unknown;
}

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

export interface BuildResult {
  instances: Record<string, unknown>;
  errors: GraphError[];
}

// Introspection of TemplateRegistry for UI palette generation
export type TemplateKind = 'trigger' | 'agent' | 'tool' | 'mcp' | 'service';
export interface TemplateNodeSchema {
  name: string; // template name (technical identifier)
  title: string; // human-readable default title (UI label)
  kind: TemplateKind; // node kind for UI badges and grouping
  sourcePorts: string[]; // names of source handles (emitters / publishers / tool collections)
  targetPorts: string[]; // names of target handles (accept dependencies / tools / instances)
}

// Persistence layer graph representation (includes optimistic locking fields)
export interface PersistedGraphNode {
  id: string;
  template: string;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  position?: { x: number; y: number }; // UI hint, optional server side
}
export interface PersistedGraphEdge {
  id?: string; // optional client-provided id (not used for runtime diff)
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
export interface PersistedGraph {
  name: string; // unique name (maps to _id in Mongo)
  version: number; // optimistic lock version
  updatedAt: string; // ISO timestamp
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
  // Optional graph-level variables (Issue #543)
  // Keys must be unique; values are plain strings.
  variables?: Array<{ key: string; value: string }>;
}
export interface PersistedGraphUpsertRequest {
  name: string;
  version?: number; // expected version (undefined => create)
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
  // Optional variables; if omitted, repositories must preserve existing values.
  variables?: Array<{ key: string; value: string }>;
}
export interface PersistedGraphUpsertResponse extends PersistedGraph {}
