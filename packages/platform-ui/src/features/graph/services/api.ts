import { graph as graphApi } from '@/api/modules/graph';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';
import type { NodeStatus, TemplateSchema } from '@/api/types/graph';
import type { GraphPersisted } from '../types';

interface NodeStateResponse {
  state: Record<string, unknown>;
}

function assertPersistedGraph(payload: unknown): GraphPersisted {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Graph payload missing');
  }
  const graph = payload as Partial<GraphPersisted>;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Graph payload invalid: nodes/edges');
  }
  if (typeof graph.version !== 'number') {
    throw new Error('Graph payload invalid: version');
  }
  if (typeof graph.name !== 'string' || graph.name.length === 0) {
    throw new Error('Graph payload invalid: name');
  }
  return graph as GraphPersisted;
}

function assertTemplateArray(payload: unknown): TemplateSchema[] {
  if (!Array.isArray(payload)) {
    throw new Error('Templates payload invalid');
  }
  return payload as TemplateSchema[];
}

type ProvisionState = NodeStatus['provisionStatus'] extends { state: infer S } ? S : never;

function assertNodeStatus(payload: unknown): NodeStatus {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;
  const result: NodeStatus = {};
  if (typeof record.isPaused === 'boolean') {
    result.isPaused = record.isPaused;
  }
  const provisionStatus = record.provisionStatus;
  if (provisionStatus != null && typeof provisionStatus !== 'object') {
    throw new Error('Node status invalid: provisionStatus');
  }
  if (provisionStatus && typeof provisionStatus === 'object') {
    const state = (provisionStatus as Record<string, unknown>).state;
    if (typeof state === 'string') {
      result.provisionStatus = {
        state: state as ProvisionState,
        details: (provisionStatus as Record<string, unknown>).details,
      };
    }
  }
  return result;
}

function assertNodeState(payload: unknown): NodeStateResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Node state payload invalid');
  }
  const state = (payload as Record<string, unknown>).state;
  if (!state || typeof state !== 'object') {
    return { state: {} };
  }
  return { state: state as Record<string, unknown> };
}

export type GraphSavePayload = PersistedGraphUpsertRequestUI;

async function fetchGraph(): Promise<GraphPersisted> {
  const payload = await graphApi.getFullGraph();
  return assertPersistedGraph(payload);
}

async function saveGraph(payload: GraphSavePayload): Promise<GraphPersisted> {
  const response = await graphApi.saveFullGraph(payload);
  return assertPersistedGraph(response);
}

async function fetchTemplates(): Promise<TemplateSchema[]> {
  const payload = await graphApi.getTemplates();
  return assertTemplateArray(payload);
}

async function fetchNodeStatus(nodeId: string): Promise<NodeStatus> {
  const payload = await graphApi.getNodeStatus(nodeId);
  return assertNodeStatus(payload);
}

async function fetchNodeState(nodeId: string): Promise<NodeStateResponse> {
  const payload = await graphApi.getNodeState(nodeId);
  return assertNodeState(payload);
}

async function updateNodeState(nodeId: string, state: Record<string, unknown>): Promise<NodeStateResponse> {
  const payload = await graphApi.putNodeState(nodeId, state);
  return assertNodeState(payload);
}

export const graphApiService = {
  fetchGraph,
  saveGraph,
  fetchTemplates,
  fetchNodeStatus,
  fetchNodeState,
  updateNodeState,
};

export type GraphApiService = typeof graphApiService;
export type GraphNodeStateResponse = NodeStateResponse;
