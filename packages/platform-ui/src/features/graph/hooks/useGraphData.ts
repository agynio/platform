import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeStatus } from '@/api/types/graph';
import { graphApiService } from '../services/api';
import { mapPersistedGraphToNodes, type GraphNodeMetadata } from '../mappers';
import { fetchTeamsGraphSnapshot } from '../services/teamsGraph';
import type {
  GraphNodeConfig,
  GraphNodeStatus,
  GraphPersistedEdge,
  GraphSaveState,
  GraphNodeUpdate,
} from '../types';

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
  setEdges: (next: GraphPersistedEdge[]) => void;
  removeNodes: (ids: string[]) => void;
  addNode: (node: GraphNodeConfig, metadata: GraphNodeMetadata) => void;
  scheduleSave: () => void;
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
  const hydratedRef = useRef(false);
  const abortRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const scheduleSave = useCallback(() => {
    if (!hydratedRef.current) {
      return;
    }
    if (!abortRef.current) {
      setSavingState({ status: 'saved', error: null });
    }
  }, []);

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
          },
        } satisfies GraphNodeConfig;
      }),
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
          const previousConfig = node.config ? (node.config as Record<string, unknown>) : undefined;
          const previousConfigHasTitle = Boolean(
            previousConfig && Object.prototype.hasOwnProperty.call(previousConfig, 'title'),
          );
          const previousTitleValue = previousConfigHasTitle ? previousConfig!.title : undefined;
          let nextConfig = previousConfig ? { ...previousConfig } : undefined;
          let metaConfig = meta?.config ? { ...(meta.config as Record<string, unknown>) } : undefined;

          if (typeof updates.config !== 'undefined' && updates.config !== node.config) {
            const patch = updates.config
              ? { ...(updates.config as Record<string, unknown>) }
              : undefined;
            const patchIncludesTitle = Boolean(
              patch && Object.prototype.hasOwnProperty.call(patch, 'title'),
            );

            if (patch) {
              nextConfig = { ...patch };
              if (!patchIncludesTitle && previousConfigHasTitle) {
                nextConfig.title = previousTitleValue;
              }
              if (meta) {
                metaConfig = { ...patch };
                if (!patchIncludesTitle && previousConfigHasTitle) {
                  metaConfig.title = previousTitleValue;
                }
              }
            } else {
              nextConfig = undefined;
              if (meta) {
                metaConfig = undefined;
              }
            }
            shouldSave = true;
          }

          if (typeof updates.title === 'string') {
            next.title = updates.title;
            nextConfig = { ...(nextConfig ?? {}), title: updates.title };
            if (meta) {
              metaConfig = { ...(metaConfig ?? {}), title: updates.title };
            }
            shouldSave = true;
          }

          next.config = nextConfig;
          if (meta) {
            meta.config = metaConfig;
          }
          if (typeof updates.status === 'string' && updates.status !== node.status) {
            next.status = updates.status as GraphNodeStatus;
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

  const removeNodes = useCallback(
    (ids: string[]) => {
      if (!Array.isArray(ids) || ids.length === 0) {
        return;
      }
      const idSet = new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0));
      if (idSet.size === 0) {
        return;
      }

      let nodesRemoved = false;
      setNodes((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const next = prev.filter((node) => !idSet.has(node.id));
        if (next.length === prev.length) {
          return prev;
        }
        nodesRemoved = true;
        return next;
      });

      for (const id of idSet) {
        metadataRef.current.delete(id);
      }

      const prevEdges = baseRef.current.edges;
      const filteredEdges = prevEdges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target));
      const edgesRemoved = filteredEdges.length !== prevEdges.length;
      if (edgesRemoved) {
        const cloned = filteredEdges.map(cloneEdge);
        baseRef.current.edges = cloned;
        setEdgeState(cloned);
      }

      if (!nodesRemoved && !edgesRemoved) {
        return;
      }
      scheduleSave();
    },
    [scheduleSave],
  );

  const addNode = useCallback((node: GraphNodeConfig, metadata: GraphNodeMetadata) => {
    if (!node || typeof node.id !== 'string' || node.id.length === 0) {
      throw new Error('Graph node id is required');
    }
    const nodeId = node.id;
    const clonedMetadata: GraphNodeMetadata = {
      template: metadata?.template ?? node.template,
      config: metadata?.config ? { ...metadata.config } : node.config ? { ...(node.config as Record<string, unknown>) } : undefined,
      position: metadata?.position
        ? { x: metadata.position.x, y: metadata.position.y }
        : { x: node.x, y: node.y },
    } satisfies GraphNodeMetadata;

    metadataRef.current.set(nodeId, clonedMetadata);

    setNodes((prev) => {
      const clonedNode: GraphNodeConfig = {
        ...node,
        config: node.config ? { ...(node.config as Record<string, unknown>) } : undefined,
        runtime: node.runtime ? { ...(node.runtime ?? {}) } : undefined,
        capabilities: node.capabilities ? { ...(node.capabilities ?? {}) } : undefined,
        ports: {
          inputs: Array.isArray(node.ports?.inputs) ? node.ports.inputs.map((port) => ({ ...port })) : [],
          outputs: Array.isArray(node.ports?.outputs) ? node.ports.outputs.map((port) => ({ ...port })) : [],
        },
      } satisfies GraphNodeConfig;

      const existingIndex = prev.findIndex((existing) => existing.id === nodeId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = clonedNode;
        nodesRef.current = next;
        return next;
      }
      const next = [...prev, clonedNode];
      nodesRef.current = next;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    abortRef.current = false;
    setLoading(true);
    try {
      const [graph, templates] = await Promise.all([
        fetchTeamsGraphSnapshot(),
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
    void refresh();
    return () => {
      abortRef.current = true;
    };
  }, [refresh]);

  const savingErrorMessage = useMemo(() => savingState.error?.message ?? null, [savingState.error]);

  return {
    nodes,
    edges,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    setEdges,
    removeNodes,
    addNode,
    scheduleSave,
    refresh,
  };
}
