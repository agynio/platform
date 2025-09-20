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
