export interface GraphDefinition {
  nodes: NodeDef[];
  edges: EdgeDef[];
}

export interface NodeDef {
  id: string;
  data: {
    template: string;
    config?: Record<string, unknown>;
    state?: Record<string, unknown>;
  };
}

export interface EdgeDef {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type DependencyBag = Record<string, unknown>;

export interface FactoryContext {
  deps?: DependencyBag;
  get: (id: string) => unknown;
  nodeId: string;
}

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
  fn: (...args: unknown[]) => unknown | Promise<unknown>;
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
  continueOnError?: boolean;
  warnOnMissingSetConfig?: boolean;
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

export interface GraphBuildResult<TError = unknown> {
  instances: Record<string, unknown>;
  errors: TError[];
}

export type TemplateKind = 'trigger' | 'agent' | 'tool' | 'mcp' | 'service';

export interface TemplateNodeSchema {
  name: string;
  title: string;
  kind: TemplateKind;
  sourcePorts: string[];
  targetPorts: string[];
}

export interface PersistedGraphNode {
  id: string;
  template: string;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface PersistedGraphEdge {
  id?: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface PersistedGraph {
  name: string;
  version: number;
  updatedAt: string;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
  variables?: Array<{ key: string; value: string }>;
}

export interface PersistedGraphUpsertRequest {
  name: string;
  version?: number;
  nodes: PersistedGraphNode[];
  edges: PersistedGraphEdge[];
  variables?: Array<{ key: string; value: string }>;
}

export type PersistedGraphUpsertResponse = PersistedGraph;
