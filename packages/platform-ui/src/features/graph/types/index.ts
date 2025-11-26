import type { NodeKind } from '@/components/Node';
import type { SavingStatus } from '@/components/SavingStatusControl';
import type { PersistedGraph, PersistedGraphEdge, PersistedGraphNode } from '@agyn/shared';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';

export type GraphNodeStatus =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

export interface GraphNodeRuntime {
  provisionStatus?: {
    state: GraphNodeStatus;
    details?: unknown;
  };
  isPaused?: boolean;
}

export interface GraphNodeCapabilities {
  provisionable?: boolean;
  pausable?: boolean;
  dynamicConfigurable?: boolean;
  staticConfigurable?: boolean;
}

export interface GraphNodePort {
  id: string;
  title: string;
}

export interface GraphNodePorts {
  inputs: GraphNodePort[];
  outputs: GraphNodePort[];
}

export interface GraphNodeConfig {
  id: string;
  template: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  status: GraphNodeStatus;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  runtime?: GraphNodeRuntime;
  capabilities?: GraphNodeCapabilities;
  ports: GraphNodePorts;
  avatarSeed?: string;
}

export interface GraphNodeUpdate {
  title?: string;
  status?: GraphNodeStatus;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  runtime?: Partial<GraphNodeRuntime>;
  x?: number;
  y?: number;
}

export type GraphSavingStatus = SavingStatus;

export type GraphPersisted = PersistedGraph;
export type GraphPersistedNode = PersistedGraphNode;
export type GraphPersistedEdge = PersistedGraphEdge;

export interface GraphDataSnapshot {
  version: number;
  updatedAt?: string;
  nodes: GraphNodeConfig[];
}

export interface GraphSaveError {
  message: string;
}

export interface GraphSaveState {
  status: GraphSavingStatus;
  error: GraphSaveError | null;
}

export type GraphUpsertRequest = PersistedGraphUpsertRequestUI;
