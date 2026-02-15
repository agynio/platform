import type { PersistedGraph } from '@agyn/shared';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';
import type { TemplateSchema } from '@/api/types/graph';
import {
  type EntityPortDefinition,
  type GraphEntityDeleteInput,
  type GraphEntityGraph,
  type GraphEntityKind,
  type GraphEntitySummary,
  type GraphEntityUpsertInput,
  type TemplateOption,
} from '../types';

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cloneGraph(graph: PersistedGraph): PersistedGraph {
  if (typeof structuredClone === 'function') {
    return structuredClone(graph);
  }
  return JSON.parse(JSON.stringify(graph)) as PersistedGraph;
}

function randomSegment(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().split('-')[0] ?? Math.random().toString(36).slice(2, 10);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function resolveEntityKind(rawKind?: string | null): GraphEntityKind {
  switch (rawKind) {
    case 'trigger':
      return 'trigger';
    case 'agent':
      return 'agent';
    case 'tool':
    case 'mcp':
      return 'tool';
    case 'service':
    default:
      return 'workspace';
  }
}

function deriveNodeTitle(node: { template: string; config?: Record<string, unknown> }, template?: TemplateSchema): string {
  const configTitle = node?.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>).title : undefined;
  if (typeof configTitle === 'string' && configTitle.trim().length > 0) {
    return configTitle.trim();
  }
  if (template?.title) {
    return template.title;
  }
  return node.template;
}

function normalizePortLabel(portId: string, definition: unknown): string {
  if (typeof definition === 'string' && definition.trim().length > 0) {
    return definition.trim();
  }
  if (definition && typeof definition === 'object') {
    const record = definition as Record<string, unknown>;
    const label = record.title ?? record.label ?? record.name;
    if (typeof label === 'string' && label.trim().length > 0) {
      return label.trim();
    }
  }
  return portId;
}

function toPortList(portDefinition: TemplateSchema['sourcePorts']): EntityPortDefinition[] {
  if (!portDefinition) return [];
  if (Array.isArray(portDefinition)) {
    return portDefinition
      .filter((port): port is string => typeof port === 'string' && port.trim().length > 0)
      .map((port) => ({ id: port, label: port }));
  }
  if (typeof portDefinition === 'object') {
    return Object.entries(portDefinition)
      .filter(([key]) => typeof key === 'string' && key.trim().length > 0)
      .map(([key, definition]) => ({ id: key, label: normalizePortLabel(key, definition) }));
  }
  return [];
}

export function getTemplatePorts(template?: TemplateSchema): { inputs: EntityPortDefinition[]; outputs: EntityPortDefinition[] } {
  if (!template) {
    return { inputs: [], outputs: [] };
  }
  return {
    inputs: toPortList(template.targetPorts),
    outputs: toPortList(template.sourcePorts),
  };
}

export function mapGraphEntities(graph: GraphEntityGraph | undefined, templates: TemplateSchema[] = []): GraphEntitySummary[] {
  if (!graph) return [];
  const templateByName = new Map<string, TemplateSchema>();
  for (const template of templates) {
    if (template?.name) {
      templateByName.set(template.name, template);
    }
  }

  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of edges) {
    if (!edge) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
  }

  const summaries: GraphEntitySummary[] = [];
  for (const node of graph.nodes ?? []) {
    if (!node) continue;
    const template = templateByName.get(node.template);
    const config = ensureRecord(node.config);
    const portGroup = getTemplatePorts(template);
    summaries.push({
      id: node.id,
      node,
      title: deriveNodeTitle(node, template),
      templateName: node.template,
      templateTitle: template?.title ?? node.template,
      templateKind: resolveEntityKind(template?.kind),
      rawTemplateKind: template?.kind,
      config,
      state: node.state ? { ...(node.state as Record<string, unknown>) } : undefined,
      position: node.position ? { ...node.position } : undefined,
      ports: portGroup,
      relations: {
        incoming: incoming.get(node.id) ?? 0,
        outgoing: outgoing.get(node.id) ?? 0,
      },
    });
  }

  return summaries;
}

export function getTemplateOptions(templates: TemplateSchema[] = [], kind?: GraphEntityKind): TemplateOption[] {
  return templates
    .map((template) => ({
      name: template.name,
      title: template.title ?? template.name,
      kind: resolveEntityKind(template.kind),
      source: template,
    }))
    .filter((option) => (kind ? option.kind === kind : true))
    .sort((a, b) => a.title.localeCompare(b.title));
}


function buildGraphPayloadInternal(graph: PersistedGraph): PersistedGraphUpsertRequestUI {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return {
    name: graph.name,
    version: graph.version,
    nodes,
    edges,
  } satisfies PersistedGraphUpsertRequestUI;
}

export function buildGraphPayload(graph: PersistedGraph): PersistedGraphUpsertRequestUI {
  return buildGraphPayloadInternal(graph);
}

function generateNodeId(template: string, graph: PersistedGraph): string {
  const existing = new Set((graph.nodes ?? []).map((node) => node.id));
  const normalizedBase = template
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'node';
  let candidate = `${normalizedBase}-${randomSegment()}`;
  while (existing.has(candidate)) {
    candidate = `${normalizedBase}-${randomSegment()}`;
  }
  return candidate;
}

function sanitizeConfig(value: Record<string, unknown>, title: string): Record<string, unknown> {
  const base = ensureRecord(value ?? {});
  return { ...base, title };
}

export function applyCreateEntity(graph: PersistedGraph, input: GraphEntityUpsertInput): PersistedGraph {
  const base = cloneGraph(graph);
  const nodeId = input.id && input.id.trim().length > 0 ? input.id.trim() : generateNodeId(input.template, base);
  const nodes = Array.isArray(base.nodes) ? [...base.nodes] : [];
  const edges = Array.isArray(base.edges) ? [...base.edges] : [];
  const config = sanitizeConfig(input.config, input.title);
  const newNode = {
    id: nodeId,
    template: input.template,
    config,
    state: undefined,
    position: { x: 0, y: 0 },
  } satisfies PersistedGraph['nodes'][number];
  nodes.push(newNode);
  return {
    ...base,
    nodes,
    edges,
  } satisfies PersistedGraph;
}

export function applyUpdateEntity(graph: PersistedGraph, input: GraphEntityUpsertInput): PersistedGraph {
  if (!input.id) {
    throw new Error('Entity id is required for updates');
  }
  const base = cloneGraph(graph);
  const nodes = Array.isArray(base.nodes) ? [...base.nodes] : [];
  const edges = Array.isArray(base.edges) ? [...base.edges] : [];
  const index = nodes.findIndex((node) => node?.id === input.id);
  if (index === -1) {
    throw new Error(`Node ${input.id} not found`);
  }
  const existing = nodes[index];
  const config = sanitizeConfig(input.config, input.title);
  nodes[index] = {
    ...existing,
    config,
  };
  return {
    ...base,
    nodes,
    edges,
  } satisfies PersistedGraph;
}

export function applyDeleteEntity(graph: PersistedGraph, input: GraphEntityDeleteInput): PersistedGraph {
  const base = cloneGraph(graph);
  const nodes = (base.nodes ?? []).filter((node) => node?.id !== input.id);
  const edges = (base.edges ?? []).filter((edge) => edge?.source !== input.id && edge?.target !== input.id);
  return {
    ...base,
    nodes,
    edges,
  } satisfies PersistedGraph;
}
