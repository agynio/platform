import type { GraphNodeConfig as GraphScreenNodeConfig } from '@/components/screens/GraphScreen';
import type { SavingStatus } from '@/components/SavingStatusControl';
import type { PersistedGraph, PersistedGraphEdge, PersistedGraphNode } from '@agyn/shared';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';

export type GraphNodeConfig = GraphScreenNodeConfig;
export type GraphNodeStatus = GraphScreenNodeConfig['status'];
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
