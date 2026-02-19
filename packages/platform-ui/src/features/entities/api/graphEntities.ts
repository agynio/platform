import type { PersistedGraph } from '@agyn/shared';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';
import type { TemplateSchema } from '@/api/types/graph';
import {
  type EntityPortDefinition,
  type GraphEdgeFilter,
  type GraphEntityDeleteInput,
  type GraphEntityEdge,
  type GraphEntityGraph,
  type GraphEntityKind,
  type GraphEntityRelationEdge,
  type GraphEntityRelationInput,
  type GraphEntitySummary,
  type GraphEntityUpsertInput,
  type TemplateOption,
} from '../types';

export const EXCLUDED_WORKSPACE_TEMPLATES = new Set(['memory', 'memoryConnector']);
export const INCLUDED_MEMORY_WORKSPACE_TEMPLATES = new Set(['memory', 'memoryConnector']);

function buildEdgeId(source: string, sourceHandle: string, target: string, targetHandle: string): string {
  const normalizedSourceHandle = sourceHandle?.length ? sourceHandle : '$self';
  const normalizedTargetHandle = targetHandle?.length ? targetHandle : '$self';
  return `${source}-${normalizedSourceHandle}__${target}-${normalizedTargetHandle}`;
}

function matchesEdgeFilter(edge: GraphEntityEdge, filter: GraphEdgeFilter): boolean {
  if (filter.sourceId && edge.source !== filter.sourceId) return false;
  if (filter.sourceHandle && edge.sourceHandle !== filter.sourceHandle) return false;
  if (filter.targetId && edge.target !== filter.targetId) return false;
  if (filter.targetHandle && edge.targetHandle !== filter.targetHandle) return false;
  return true;
}

export function listTargetsByEdge(edges: GraphEntityEdge[] | undefined, filter: GraphEdgeFilter): GraphEntityEdge[] {
  if (!Array.isArray(edges) || edges.length === 0) {
    return [];
  }
  return edges.filter((edge): edge is GraphEntityEdge => Boolean(edge) && matchesEdgeFilter(edge, filter));
}

type ReplaceEdgesOptions = GraphEdgeFilter & {
  edges: PersistedGraph['edges'] | undefined;
  nextPairs: GraphEntityRelationEdge[];
};

export function replaceEdgesForHandle(options: ReplaceEdgesOptions): PersistedGraph['edges'] {
  const { edges, nextPairs, ...filter } = options;
  const baseEdges = Array.isArray(edges)
    ? edges.filter((edge): edge is PersistedGraph['edges'][number] => Boolean(edge))
    : [];
  const remaining = baseEdges.filter((edge) => !matchesEdgeFilter(edge, filter));

  const merged = new Map<string, PersistedGraph['edges'][number]>();
  for (const edge of remaining) {
    const key = edge.id ?? buildEdgeId(edge.source, edge.sourceHandle, edge.target, edge.targetHandle);
    merged.set(key, edge);
  }

  for (const pair of nextPairs) {
    if (!pair.sourceId || !pair.targetId) continue;
    const normalizedSourceHandle = pair.sourceHandle?.length ? pair.sourceHandle : '$self';
    const normalizedTargetHandle = pair.targetHandle?.length ? pair.targetHandle : '$self';
    const id = buildEdgeId(pair.sourceId, normalizedSourceHandle, pair.targetId, normalizedTargetHandle);
    merged.set(id, {
      id,
      source: pair.sourceId,
      sourceHandle: normalizedSourceHandle,
      target: pair.targetId,
      targetHandle: normalizedTargetHandle,
    });
  }

  return Array.from(merged.values());
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEnvEntryRecord(value: Record<string, unknown>): boolean {
  return typeof value.name === 'string' && Object.prototype.hasOwnProperty.call(value, 'value');
}

function sanitizeEnvEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(entry)) {
    if (key === 'source') {
      continue;
    }
    next[key] = sanitizeConfigValue(nested);
  }
  return next;
}

function sanitizeConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isPlainRecord(item) && isEnvEntryRecord(item)) {
        return sanitizeEnvEntry(item);
      }
      return sanitizeConfigValue(item);
    });
  }
  if (isPlainRecord(value)) {
    if (isEnvEntryRecord(value)) {
      return sanitizeEnvEntry(value);
    }
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = sanitizeConfigValue(nested);
    }
    return next;
  }
  return value;
}

export function sanitizeConfigForPersistence(_templateName: string, config: Record<string, unknown> | undefined): Record<string, unknown> {
  const base = ensureRecord(config ?? {});
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === 'title' || key === 'template' || key === 'kind') {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    sanitized[key] = sanitizeConfigValue(value);
  }
  return sanitized;
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
      return 'tool';
    case 'mcp':
      return 'mcp';
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
    const resolvedKind = resolveEntityKind(template?.kind);

    summaries.push({
      id: node.id,
      node,
      title: deriveNodeTitle(node, template),
      templateName: node.template,
      templateTitle: template?.title ?? node.template,
      templateKind: resolvedKind,
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

export function getTemplateOptions(
  templates: TemplateSchema[] = [],
  kind?: GraphEntityKind,
  excludeTemplateNames?: ReadonlySet<string> | Set<string>,
): TemplateOption[] {
  return templates
    .map((template) => ({
      name: template.name,
      title: template.title ?? template.name,
      kind: resolveEntityKind(template.kind),
      source: template,
    }))
    .filter((option) => {
      if (kind && option.kind !== kind) {
        return false;
      }
      if (excludeTemplateNames && excludeTemplateNames.has(option.name)) {
        return false;
      }
      return true;
    })
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

function applyRelationEdges(
  existingEdges: PersistedGraph['edges'] | undefined,
  nodeId: string,
  relations: GraphEntityRelationInput[] | undefined,
): PersistedGraph['edges'] {
  if (!relations || relations.length === 0) {
    return Array.isArray(existingEdges)
      ? existingEdges.filter((edge): edge is PersistedGraph['edges'][number] => Boolean(edge))
      : [];
  }

  let nextEdges = Array.isArray(existingEdges)
    ? existingEdges.filter((edge): edge is PersistedGraph['edges'][number] => Boolean(edge))
    : [];

  for (const relation of relations) {
    const ownerId = relation.ownerId && relation.ownerId.length > 0 ? relation.ownerId : nodeId;
    if (!ownerId) continue;
    const normalizedSelections = relation.mode === 'single'
      ? relation.selections.slice(0, 1)
      : relation.selections;
    const peerIds = Array.from(new Set(normalizedSelections.filter((value) => typeof value === 'string' && value.length > 0)));

    const filter: GraphEdgeFilter =
      relation.ownerRole === 'source'
        ? { sourceId: ownerId, sourceHandle: relation.ownerHandle }
        : { targetId: ownerId, targetHandle: relation.ownerHandle };

    const nextPairs: GraphEntityRelationEdge[] = peerIds.map((peerId) =>
      relation.ownerRole === 'source'
        ? {
            sourceId: ownerId,
            sourceHandle: relation.ownerHandle,
            targetId: peerId,
            targetHandle: relation.peerHandle,
          }
        : {
            sourceId: peerId,
            sourceHandle: relation.peerHandle,
            targetId: ownerId,
            targetHandle: relation.ownerHandle,
          },
    );

    nextEdges = replaceEdgesForHandle({ edges: nextEdges, ...filter, nextPairs });
  }

  return nextEdges;
}

export function applyCreateEntity(graph: PersistedGraph, input: GraphEntityUpsertInput): PersistedGraph {
  const base = cloneGraph(graph);
  const nodeId = input.id && input.id.trim().length > 0 ? input.id.trim() : generateNodeId(input.template, base);
  const nodes = Array.isArray(base.nodes) ? [...base.nodes] : [];
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
    edges: applyRelationEdges(base.edges, nodeId, input.relations),
  } satisfies PersistedGraph;
}

export function applyUpdateEntity(graph: PersistedGraph, input: GraphEntityUpsertInput): PersistedGraph {
  if (!input.id) {
    throw new Error('Entity id is required for updates');
  }
  const base = cloneGraph(graph);
  const nodes = Array.isArray(base.nodes) ? [...base.nodes] : [];
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
    edges: applyRelationEdges(base.edges, input.id, input.relations),
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
