import type { TemplateSchema } from '@/api/types/graph';
import type {
  GraphNodeConfig,
  GraphNodeStatus,
  GraphPersisted,
  GraphPersistedEdge,
  GraphPersistedNode,
  GraphUpsertRequest,
} from '../types';

export interface GraphNodeMetadata {
  template: string;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphMapperResult {
  nodes: GraphNodeConfig[];
  metadata: Map<string, GraphNodeMetadata>;
}

const DEFAULT_STATUS: GraphNodeStatus = 'not_ready';

function normalizePosition(position?: { x: number; y: number }): { x: number; y: number } {
  if (!position) return { x: 0, y: 0 };
  const { x, y } = position;
  return {
    x: Number.isFinite(x) ? Number(x) : 0,
    y: Number.isFinite(y) ? Number(y) : 0,
  };
}

function toNodeKind(kind: TemplateSchema['kind'] | undefined): GraphNodeConfig['kind'] {
  switch (kind) {
    case 'trigger':
      return 'Trigger';
    case 'agent':
      return 'Agent';
    case 'tool':
      return 'Tool';
    case 'mcp':
      return 'MCP';
    case 'service':
    default:
      return 'Workspace';
  }
}

function deriveTitle(node: GraphPersistedNode, template?: TemplateSchema): string {
  const configTitle = node.config && typeof node.config === 'object'
    ? (node.config as Record<string, unknown>).title
    : undefined;
  if (typeof configTitle === 'string' && configTitle.trim().length > 0) {
    return configTitle.trim();
  }
  if (template?.title) return template.title;
  return node.template;
}

function normalizePortTitle(id: string, definition: unknown): string {
  if (typeof definition === 'string') {
    return definition.trim().length > 0 ? definition : id;
  }
  if (definition && typeof definition === 'object') {
    const record = definition as Record<string, unknown>;
    const title = record.title ?? record.label ?? record.name;
    if (typeof title === 'string' && title.trim().length > 0) {
      return title;
    }
  }
  return id;
}

function toPortList(portDefinition: TemplateSchema['sourcePorts']): GraphNodeConfig['ports']['inputs'] {
  if (!portDefinition) return [];
  if (Array.isArray(portDefinition)) {
    return portDefinition
      .filter((port): port is string => typeof port === 'string' && port.trim().length > 0)
      .map((port) => ({ id: port, title: port }));
  }
  if (typeof portDefinition === 'object') {
    const entries = Object.entries(portDefinition as Record<string, unknown>);
    return entries
      .filter(([id]) => typeof id === 'string' && id.trim().length > 0)
      .map(([id, definition]) => ({ id, title: normalizePortTitle(id, definition) }));
  }
  return [];
}

function deriveCapabilities(template?: TemplateSchema): GraphNodeConfig['capabilities'] | undefined {
  if (!template?.capabilities) {
    return undefined;
  }
  const source = template.capabilities;
  const result: GraphNodeConfig['capabilities'] = {};
  if (source.provisionable !== undefined) {
    result.provisionable = source.provisionable;
  }
  if (source.pausable !== undefined) {
    result.pausable = source.pausable;
  }
  if (source.dynamicConfigurable !== undefined) {
    result.dynamicConfigurable = source.dynamicConfigurable;
  }
  if (source.staticConfigurable !== undefined) {
    result.staticConfigurable = source.staticConfigurable;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function mapPersistedGraphToNodes(
  graph: GraphPersisted,
  templates: TemplateSchema[],
): GraphMapperResult {
  const byTemplate = new Map<string, TemplateSchema>();
  for (const tpl of templates) {
    if (!tpl?.name) continue;
    byTemplate.set(tpl.name, tpl);
  }

  const metadata = new Map<string, GraphNodeMetadata>();
  const nodes: GraphNodeConfig[] = graph.nodes.map((node) => {
    const tpl = byTemplate.get(node.template);
    const position = normalizePosition(node.position);
    const title = deriveTitle(node, tpl);
    const config = node.config ? { ...(node.config as Record<string, unknown>) } : undefined;
    const state = node.state ? { ...(node.state as Record<string, unknown>) } : undefined;
    metadata.set(node.id, {
      template: node.template,
      config,
      state,
      position,
    });
    const ports = {
      inputs: toPortList(tpl?.targetPorts),
      outputs: toPortList(tpl?.sourcePorts),
    };
    return {
      id: node.id,
      template: node.template,
      kind: toNodeKind(tpl?.kind),
      title,
      x: position.x,
      y: position.y,
      status: DEFAULT_STATUS,
      config,
      state,
      runtime: undefined,
      capabilities: deriveCapabilities(tpl),
      ports,
      avatarSeed: node.id,
    } satisfies GraphNodeConfig;
  });

  return { nodes, metadata };
}

interface BuildSavePayloadOptions {
  name: string;
  version?: number;
  nodes: GraphNodeConfig[];
  metadata: Map<string, GraphNodeMetadata>;
  edges: GraphPersistedEdge[];
}

function toPersistedNode(node: GraphNodeConfig, meta: GraphNodeMetadata): GraphPersistedNode {
  const position = {
    x: Number.isFinite(node.x) ? node.x : meta.position?.x ?? 0,
    y: Number.isFinite(node.y) ? node.y : meta.position?.y ?? 0,
  };
  return {
    id: node.id,
    template: meta.template,
    position,
    config: meta.config ? { ...meta.config } : undefined,
    state: meta.state ? { ...meta.state } : undefined,
  } satisfies GraphPersistedNode;
}

export function buildGraphSavePayload(options: BuildSavePayloadOptions): GraphUpsertRequest {
  const { name, version, nodes, metadata, edges } = options;
  const persistedNodes: GraphPersistedNode[] = nodes.map((node) => {
    const meta = metadata.get(node.id);
    if (!meta) {
      throw new Error(`Missing metadata for node ${node.id}`);
    }
    return toPersistedNode(node, meta);
  });

  const persistedEdges = edges.map((edge) => ({ ...edge }));

  return {
    name,
    version,
    nodes: persistedNodes,
    edges: persistedEdges,
  } satisfies GraphUpsertRequest;
}
