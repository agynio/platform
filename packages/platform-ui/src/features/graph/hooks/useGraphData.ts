import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeStatus } from '@/api/types/graph';
import { graphApiService } from '../services/api';
import { buildGraphSavePayload, mapPersistedGraphToNodes, type GraphNodeMetadata } from '../mappers';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge, GraphSaveState } from '../types';

const SAVE_DEBOUNCE_MS = 800;

function toGraphStatus(status: NodeStatus | undefined): GraphNodeStatus {
  const state = status?.provisionStatus?.state;
  switch (state) {
    case 'ready':
      return 'ready';
    case 'provisioning':
      return 'provisioning';
    case 'deprovisioning':
      return 'deprovisioning';
    case 'provisioning_error':
      return 'provisioning_error';
    case 'deprovisioning_error':
      return 'deprovisioning_error';
    case 'error':
      return 'provisioning_error';
    case 'not_ready':
    default:
      return 'not_ready';
  }
}

interface GraphBaseState {
  name: string;
  version?: number;
  edges: GraphPersistedEdge[];
}

function cloneEdge(edge: GraphPersistedEdge): GraphPersistedEdge {
  return { ...edge };
}

interface UseGraphDataResult {
  nodes: GraphNodeConfig[];
  loading: boolean;
  savingState: GraphSaveState;
  savingErrorMessage: string | null;
  updateNode: (nodeId: string, updates: Partial<GraphNodeConfig>) => void;
  applyNodeStatus: (nodeId: string, status: NodeStatus) => void;
  applyNodeState: (nodeId: string, state: Record<string, unknown>) => void;
  refresh: () => Promise<void>;
}

export function useGraphData(): UseGraphDataResult {
  const [nodes, setNodes] = useState<GraphNodeConfig[]>([]);
  const nodesRef = useRef<GraphNodeConfig[]>([]);
  const metadataRef = useRef<Map<string, GraphNodeMetadata>>(new Map());
  const baseRef = useRef<GraphBaseState>({ name: 'agents', version: 0, edges: [] });
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<GraphSaveState>({ status: 'saved', error: null });
  const saveTimeoutRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const abortRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const clearScheduledSave = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    clearScheduledSave();
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      const payload = buildGraphSavePayload({
        name: baseRef.current.name,
        version: baseRef.current.version,
        nodes: nodesRef.current,
        metadata: metadataRef.current,
        edges: baseRef.current.edges,
      });
      const result = await graphApiService.saveGraph(payload);
      baseRef.current = {
        name: result.name,
        version: result.version,
        edges: (result.edges ?? []).map(cloneEdge),
      };
      setSavingState({ status: 'saved', error: null });
    } catch (error) {
      dirtyRef.current = true;
      const message = error instanceof Error ? error.message : 'Save failed';
      setSavingState({ status: 'error', error: { message } });
    }
  }, [clearScheduledSave]);

  const scheduleSave = useCallback(() => {
    if (!hydratedRef.current) return;
    dirtyRef.current = true;
    setSavingState({ status: 'saving', error: null });
    clearScheduledSave();
    saveTimeoutRef.current = window.setTimeout(() => {
      void performSave();
    }, SAVE_DEBOUNCE_MS);
  }, [clearScheduledSave, performSave]);

  const applyNodeStatus = useCallback((nodeId: string, status: NodeStatus) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              status: toGraphStatus(status),
              data: {
                ...(node.data ?? {}),
                provisionStatus: status.provisionStatus,
                isPaused: status.isPaused,
              },
            }
          : node,
      ),
    );
  }, []);

  const applyNodeState = useCallback((nodeId: string, state: Record<string, unknown>) => {
    const meta = metadataRef.current.get(nodeId);
    if (meta) {
      meta.state = { ...state };
    }
  }, []);

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<GraphNodeConfig>) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const next: GraphNodeConfig = { ...node };
          if (typeof updates.title === 'string') {
            next.title = updates.title;
          }
          if (updates.data && typeof updates.data === 'object') {
            next.data = { ...(node.data ?? {}), ...(updates.data as Record<string, unknown>) };
          }
          if (typeof updates.status === 'string') {
            next.status = updates.status as GraphNodeStatus;
          }
          return next;
        }),
      );

      const meta = metadataRef.current.get(nodeId);
      if (meta && updates.data && typeof updates.data === 'object') {
        meta.config = { ...(meta.config ?? {}), ...(updates.data as Record<string, unknown>) };
      }
      if (meta && typeof updates.title === 'string') {
        meta.config = { ...(meta.config ?? {}), title: updates.title };
      }

      scheduleSave();
    },
    [scheduleSave],
  );

  const refresh = useCallback(async () => {
    abortRef.current = false;
    setLoading(true);
    try {
      const [graph, templates] = await Promise.all([
        graphApiService.fetchGraph(),
        graphApiService.fetchTemplates(),
      ]);

      if (abortRef.current) return;

      const { nodes: mappedNodes, metadata } = mapPersistedGraphToNodes(graph, templates);
      metadataRef.current = metadata;
      baseRef.current = {
        name: graph.name,
        version: graph.version,
        edges: (graph.edges ?? []).map(cloneEdge),
      };
      setNodes(mappedNodes);

      const statusPromises = graph.nodes.map(async (node) => {
        try {
          return [node.id, await graphApiService.fetchNodeStatus(node.id)] as const;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('Failed to load node status', node.id, error);
          }
          return null;
        }
      });

      const statuses = await Promise.all(statusPromises);
      if (!abortRef.current) {
        for (const entry of statuses) {
          if (!entry) continue;
          applyNodeStatus(entry[0], entry[1]);
        }
      }

      hydratedRef.current = true;
      setSavingState({ status: 'saved', error: null });
    } catch (error) {
      if (!abortRef.current) {
        const message = error instanceof Error ? error.message : 'Graph load failed';
        setSavingState({ status: 'error', error: { message } });
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  }, [applyNodeStatus]);

  useEffect(() => {
    void refresh();
    return () => {
      abortRef.current = true;
      clearScheduledSave();
    };
  }, [refresh, clearScheduledSave]);

  const savingErrorMessage = useMemo(() => savingState.error?.message ?? null, [savingState.error]);

  return {
    nodes,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    applyNodeState,
    refresh,
  };
}
