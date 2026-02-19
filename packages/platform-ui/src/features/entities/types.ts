import type { PersistedGraph, PersistedGraphEdge, PersistedGraphNode } from '@agyn/shared';
import type { TemplateSchema } from '@/api/types/graph';

export type GraphEntityKind = 'trigger' | 'agent' | 'tool' | 'mcp' | 'workspace';

export interface EntityPortDefinition {
  id: string;
  label: string;
}

export interface EntityPortGroup {
  inputs: EntityPortDefinition[];
  outputs: EntityPortDefinition[];
}

export interface GraphEntitySummary {
  id: string;
  node: PersistedGraphNode;
  title: string;
  templateName: string;
  templateTitle: string;
  templateKind: GraphEntityKind;
  rawTemplateKind?: string;
  config: Record<string, unknown>;
  state?: Record<string, unknown>;
  position?: { x: number; y: number };
  ports: EntityPortGroup;
  relations: { incoming: number; outgoing: number };
}

export interface GraphEntityRelationDefinition {
  id: string;
  label: string;
  description?: string;
  templateNames: ReadonlyArray<string>;
  sourceHandle: string;
  targetHandle: string;
  targetKind: GraphEntityKind;
}

export interface GraphEntityRelationInput {
  id: string;
  sourceHandle: string;
  targetHandle: string;
  targetId: string | null;
}

export interface GraphEntityUpsertInput {
  id?: string;
  template: string;
  title: string;
  config: Record<string, unknown>;
  relations?: GraphEntityRelationInput[];
}

export interface GraphEntityDeleteInput {
  id: string;
}

export type GraphEntityGraph = PersistedGraph;
export type GraphEntityNode = PersistedGraphNode;
export type GraphEntityEdge = PersistedGraphEdge;

export interface VersionConflictPayload {
  current?: PersistedGraph;
}

export interface TemplateOption {
  name: string;
  title: string;
  kind: GraphEntityKind;
  source: TemplateSchema;
}
