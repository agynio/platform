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
  };
}

export interface EdgeDef {
  source: string; // node id
  sourceHandle: string; // handle name on source instance
  target: string; // node id
  targetHandle: string; // handle name on target instance
}

export interface DependencyBag {
  // Arbitrary shared services / singletons instanced outside the builder
  // (e.g., logger, configService, slackService, containerProvider, checkpointerService, etc.)
  [k: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface FactoryContext {
  deps: DependencyBag;
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
  fn: Function; // eslint-disable-line @typescript-eslint/ban-types
  owner: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface PropertyEndpoint extends EndpointBase {
  type: 'property';
  key: string;
  owner: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface SelfEndpoint extends EndpointBase {
  type: 'self';
  owner: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
export type TemplateKind = 'trigger' | 'agent' | 'tool' | 'mcp';
export interface TemplateNodeSchema {
  name: string; // template name (technical identifier)
  title: string; // human-readable default title (UI label)
  kind: TemplateKind; // node kind for UI badges and grouping
  sourcePorts: string[]; // names of source handles (emitters / publishers / tool collections)
  targetPorts: string[]; // names of target handles (accept dependencies / tools / instances)
  capabilities?: {
    pausable?: boolean;
    staticConfigurable?: boolean;
    dynamicConfigurable?: boolean;
    provisionable?: boolean;
  };
  staticConfigSchema?: import('json-schema').JSONSchema7;
}

// Persistence layer graph representation (includes optimistic locking fields)
export interface PersistedGraphNode {
  id: string;
  template: string;
  config?: Record<string, unknown>;
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
}
export interface PersistedGraphUpsertRequest {
  name: string;
  version?: number; // expected version (undefined => create)
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
}
export interface PersistedGraphUpsertResponse extends PersistedGraph {}
