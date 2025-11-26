import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeStatus } from '@/api/types/graph';
import { graphApiService } from '../services/api';
import { buildGraphSavePayload, mapPersistedGraphToNodes, type GraphNodeMetadata } from '../mappers';
import type {
  GraphNodeConfig,
  GraphNodeStatus,
  GraphPersistedEdge,
  GraphSaveState,
  GraphNodeUpdate,
} from '../types';

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
  edges: GraphPersistedEdge[];
  loading: boolean;
  savingState: GraphSaveState;
  savingErrorMessage: string | null;
  updateNode: (nodeId: string, updates: GraphNodeUpdate) => void;
  applyNodeStatus: (nodeId: string, status: NodeStatus) => void;
  applyNodeState: (nodeId: string, state: Record<string, unknown>) => void;
  setEdges: (next: GraphPersistedEdge[]) => void;
  refresh: () => Promise<void>;
}

export function useGraphData(): UseGraphDataResult {
  const [nodes, setNodes] = useState<GraphNodeConfig[]>([]);
  const [edges, setEdgeState] = useState<GraphPersistedEdge[]>([]);
  const nodesRef = useRef<GraphNodeConfig[]>([]);
  const metadataRef = useRef<Map<string, GraphNodeMetadata>>(new Map());
  const baseRef = useRef<GraphBaseState>({ name: 'agents', version: 0, edges: [] });
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<GraphSaveState>({ status: 'saved', error: null });
  const saveTimeoutRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const abortRef = useRef(false);
  const savingInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const isMountedRef = useRef(true);

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
    if (!dirtyRef.current) {
      pendingSaveRef.current = false;
      return;
    }

    if (savingInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    savingInFlightRef.current = true;
    pendingSaveRef.current = false;
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

      if (isMountedRef.current && !abortRef.current) {
        setEdgeState((result.edges ?? []).map(cloneEdge));
        if (dirtyRef.current || pendingSaveRef.current) {
          setSavingState({ status: 'saving', error: null });
        } else {
          setSavingState({ status: 'saved', error: null });
        }
      }
    } catch (error) {
      dirtyRef.current = true;
      const message = error instanceof Error ? error.message : 'Save failed';
      if (isMountedRef.current && !abortRef.current) {
        setSavingState({ status: 'error', error: { message } });
      }
    } finally {
      savingInFlightRef.current = false;
      const shouldContinue = isMountedRef.current && !abortRef.current;
      if (shouldContinue && pendingSaveRef.current) {
        pendingSaveRef.current = false;
        dirtyRef.current = true;
        void performSave();
      }
    }
  }, [clearScheduledSave]);

  const scheduleSave = useCallback(() => {
    if (!hydratedRef.current) {
      return;
    }
    dirtyRef.current = true;
    if (isMountedRef.current && !abortRef.current) {
      setSavingState({ status: 'saving', error: null });
    }

    if (savingInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    clearScheduledSave();
    saveTimeoutRef.current = window.setTimeout(() => {
      void performSave();
    }, SAVE_DEBOUNCE_MS);
  }, [clearScheduledSave, performSave]);

  const applyNodeStatus = useCallback((nodeId: string, status: NodeStatus) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          status: toGraphStatus(status),
          runtime: {
            provisionStatus: status.provisionStatus
              ? { state: toGraphStatus(status), details: status.provisionStatus.details }
              : undefined,
            isPaused: status.isPaused,
          },
        } satisfies GraphNodeConfig;
      }),
    );
  }, []);

  const applyNodeState = useCallback((nodeId: string, state: Record<string, unknown>) => {
    const meta = metadataRef.current.get(nodeId);
    if (meta) {
      meta.state = { ...state };
    }
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, state: { ...state } } : node)),
    );
  }, []);

  const updateNode = useCallback(
    (nodeId: string, updates: GraphNodeUpdate) => {
      setNodes((prev) => {
        let shouldSave = false;
        const mapped = prev.map((node) => {
          if (node.id !== nodeId) return node;
          const meta = metadataRef.current.get(nodeId);
          const next: GraphNodeConfig = { ...node };
          if (typeof updates.title === 'string' && updates.title !== node.title) {
            next.title = updates.title;
            if (meta) {
              meta.config = { ...(meta.config ?? {}), title: updates.title };
            }
            shouldSave = true;
          }
          if (typeof updates.status === 'string' && updates.status !== node.status) {
            next.status = updates.status as GraphNodeStatus;
          }
          if (updates.config && updates.config !== node.config) {
            next.config = { ...updates.config };
            if (meta) {
              meta.config = { ...updates.config };
            }
            shouldSave = true;
          }
          if (updates.state && updates.state !== node.state) {
            next.state = { ...updates.state };
            if (meta) {
              meta.state = { ...updates.state };
            }
          }
          if (updates.runtime) {
            next.runtime = { ...(node.runtime ?? {}), ...updates.runtime };
          }

          let positionUpdated = false;
          let nextX = node.x;
          let nextY = node.y;
          if (typeof updates.x === 'number' && updates.x !== node.x) {
            nextX = updates.x;
            positionUpdated = true;
          }
          if (typeof updates.y === 'number' && updates.y !== node.y) {
            nextY = updates.y;
            positionUpdated = true;
          }
          if (positionUpdated) {
            next.x = nextX;
            next.y = nextY;
            if (meta) {
              meta.position = { x: nextX, y: nextY };
            }
            shouldSave = true;
          }
          return next;
        });

        if (shouldSave) {
          scheduleSave();
        }
        return mapped;
      });
    },
    [scheduleSave],
  );

  const setEdges = useCallback(
    (next: GraphPersistedEdge[]) => {
      const cloned = next.map(cloneEdge);
      baseRef.current.edges = cloned;
      setEdgeState(cloned);
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
      const nextEdges = (graph.edges ?? []).map(cloneEdge);
      baseRef.current = {
        name: graph.name,
        version: graph.version,
        edges: nextEdges,
      };
      setEdgeState(nextEdges);
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
    isMountedRef.current = true;
    void refresh();
    return () => {
      abortRef.current = true;
      isMountedRef.current = false;
      savingInFlightRef.current = false;
      pendingSaveRef.current = false;
      clearScheduledSave();
    };
  }, [refresh, clearScheduledSave]);

  const savingErrorMessage = useMemo(() => savingState.error?.message ?? null, [savingState.error]);

  return {
    nodes,
    edges,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    applyNodeState,
    setEdges,
    refresh,
  };
}
