import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type EdgeTypes, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../GraphCanvas';
import { GradientEdge } from './edges/GradientEdge';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import NodePropertiesSidebar, { type NodeConfig as SidebarNodeConfig } from '../NodePropertiesSidebar';

import { useGraphData } from '@/features/graph/hooks/useGraphData';
import { useGraphSocket } from '@/features/graph/hooks/useGraphSocket';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import { useMcpNodeState } from '@/lib/graph/hooks';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge } from '@/features/graph/types';
import type { NodeStatus as ApiNodeStatus } from '@/api/types/graph';

type FlowNode = Node<GraphNodeData>;

type FlowEdgeData = {
  sourceColor: string;
  targetColor: string;
  sourceKind?: GraphNodeConfig['kind'];
  targetKind?: GraphNodeConfig['kind'];
};

type FlowEdge = Edge<FlowEdgeData>;

const nodeKindToColor: Record<GraphNodeConfig['kind'], string> = {
  Trigger: 'var(--agyn-yellow)',
  Agent: 'var(--agyn-blue)',
  Tool: 'var(--agyn-cyan)',
  MCP: 'var(--agyn-cyan)',
  Workspace: 'var(--agyn-purple)',
};

const defaultSourceColor = 'var(--agyn-blue)';
const defaultTargetColor = 'var(--agyn-purple)';

export interface GraphLayoutServices {
  searchNixPackages: (query: string) => Promise<Array<{ name: string }>>;
  listNixPackageVersions: (name: string) => Promise<Array<{ version: string }>>;
  resolveNixSelection: (name: string, version: string) => Promise<{ version: string; commit: string; attr: string }>;
  listVaultMounts: () => Promise<string[]>;
  listVaultPaths: (mount: string, prefix?: string) => Promise<string[]>;
  listVaultKeys: (mount: string, path?: string, opts?: { maskErrors?: boolean }) => Promise<string[]>;
  listVariableKeys: () => Promise<string[]>;
}

export interface GraphLayoutProps {
  services: GraphLayoutServices;
}

function toFlowNode(node: GraphNodeConfig): FlowNode {
  return {
    id: node.id,
    type: 'graphNode',
    position: { x: node.x, y: node.y },
    data: {
      kind: node.kind,
      title: node.title,
      inputs: node.ports.inputs,
      outputs: node.ports.outputs,
      avatarSeed: node.avatarSeed,
    },
    selected: false,
  } satisfies FlowNode;
}

function encodeHandle(handle?: string | null): string {
  if (typeof handle === 'string' && handle.length > 0 && handle !== '$') {
    return handle;
  }
  return '$';
}

function decodeHandle(handle?: string | null): string | undefined {
  if (!handle || handle === '$') {
    return undefined;
  }
  return handle;
}

function buildEdgeId(
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
  targetHandle: string | null | undefined,
): string {
  return `${source}-${encodeHandle(sourceHandle)}__${target}-${encodeHandle(targetHandle)}`;
}

function makeEdgeData(
  sourceNode?: GraphNodeConfig,
  targetNode?: GraphNodeConfig,
): FlowEdgeData {
  const sourceKind = sourceNode?.kind;
  const targetKind = targetNode?.kind;
  return {
    sourceColor: sourceKind ? nodeKindToColor[sourceKind] ?? defaultSourceColor : defaultSourceColor,
    targetColor: targetKind ? nodeKindToColor[targetKind] ?? defaultTargetColor : defaultTargetColor,
    sourceKind,
    targetKind,
  } satisfies FlowEdgeData;
}

function toFlowEdge(edge: GraphPersistedEdge, data: FlowEdgeData): FlowEdge {
  const sourceHandle = decodeHandle(edge.sourceHandle);
  const targetHandle = decodeHandle(edge.targetHandle);
  return {
    id: buildEdgeId(edge.source, sourceHandle, edge.target, targetHandle),
    type: 'gradient',
    source: edge.source,
    target: edge.target,
    sourceHandle,
    targetHandle,
    data,
  } satisfies FlowEdge;
}

function fromFlowEdge(edge: FlowEdge): GraphPersistedEdge {
  return {
    id: buildEdgeId(edge.source, edge.sourceHandle, edge.target, edge.targetHandle),
    source: edge.source,
    target: edge.target,
    sourceHandle: encodeHandle(edge.sourceHandle),
    targetHandle: encodeHandle(edge.targetHandle),
  } satisfies GraphPersistedEdge;
}

function mapProvisionState(status?: ApiNodeStatus): GraphNodeStatus | undefined {
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
      return state ? 'not_ready' : undefined;
  }
}

export function GraphLayout({ services }: GraphLayoutProps) {
  const {
    nodes,
    edges,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    applyNodeState,
    setEdges,
  } = useGraphData();

  const providerDebounceMs = 275;
  const vaultMountsRef = useRef<string[] | null>(null);
  const vaultMountsPromiseRef = useRef<Promise<string[]> | null>(null);
  const variableKeysRef = useRef<string[]>([]);
  const variableKeysPromiseRef = useRef<Promise<string[]> | null>(null);

  const ensureVaultMounts = useCallback(async (): Promise<string[]> => {
    if (vaultMountsRef.current) {
      return vaultMountsRef.current;
    }
    if (!vaultMountsPromiseRef.current) {
      vaultMountsPromiseRef.current = services
        .listVaultMounts()
        .then((items) => {
          const sanitized = Array.isArray(items)
            ? items.filter((item): item is string => typeof item === 'string' && item.length > 0)
            : [];
          vaultMountsRef.current = sanitized;
          return sanitized;
        })
        .catch(() => {
          vaultMountsRef.current = [];
          return [];
        })
        .finally(() => {
          vaultMountsPromiseRef.current = null;
        });
    }
    try {
      return await vaultMountsPromiseRef.current;
    } catch {
      return [];
    }
  }, [services]);

  const handleNixPackageSearch = useCallback(
    async (query: string): Promise<Array<{ value: string; label: string }>> => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      try {
        const result = await services.searchNixPackages(trimmed);
        return result
          .filter((item) => item && typeof item.name === 'string')
          .map((item) => ({ value: item.name, label: item.name }));
      } catch {
        return [];
      }
    },
    [services],
  );

  const handleFetchNixPackageVersions = useCallback(
    async (name: string): Promise<string[]> => {
      if (!name) return [];
      try {
        const result = await services.listNixPackageVersions(name);
        return result
          .map((item) => item?.version)
          .filter((version): version is string => typeof version === 'string' && version.length > 0);
      } catch {
        return [];
      }
    },
    [services],
  );

  const handleResolveNixPackageSelection = useCallback(
    async (name: string, version: string) => {
      const resolved = await services.resolveNixSelection(name, version);
      if (!resolved || typeof resolved.version !== 'string') {
        throw new Error('nix-resolve-invalid');
      }
      return {
        version: resolved.version,
        commitHash: resolved.commit,
        attributePath: resolved.attr,
      };
    },
    [services],
  );

  const ensureVariableKeys = useCallback(async (): Promise<string[]> => {
    if (variableKeysRef.current.length > 0) {
      return variableKeysRef.current;
    }
    if (!variableKeysPromiseRef.current) {
      variableKeysPromiseRef.current = services
        .listVariableKeys()
        .then((items) => {
          const sanitized = Array.isArray(items)
            ? items.filter((item): item is string => typeof item === 'string' && item.length > 0)
            : [];
          variableKeysRef.current = sanitized;
          return sanitized;
        })
        .catch(() => {
          variableKeysRef.current = [];
          return [];
        })
        .finally(() => {
          variableKeysPromiseRef.current = null;
        });
    }
    try {
      return await variableKeysPromiseRef.current;
    } catch {
      return [];
    }
  }, [services]);

  const fetchVariableSuggestions = useCallback(
    async (raw: string) => {
      try {
        const keys = await ensureVariableKeys();
        const query = (raw ?? '').trim().toLowerCase();
        const filtered = query.length === 0
          ? keys
          : keys.filter((key) => key.toLowerCase().includes(query));
        return filtered.slice(0, 50);
      } catch {
        return [];
      }
    },
    [ensureVariableKeys],
  );

  const fetchVaultSuggestions = useCallback(
    async (raw: string) => {
      try {
        const mounts = await ensureVaultMounts();
        const input = (raw ?? '').trim();
        if (!input) {
          return mounts.map((mount) => `${mount}/`);
        }

        const normalized = input.replace(/^\/+/, '');
        const lowerNormalized = normalized.toLowerCase();

        if (!normalized.includes('/')) {
          return mounts
            .filter((mount) => mount.toLowerCase().startsWith(lowerNormalized))
            .map((mount) => `${mount}/`);
        }

        const [mountName, ...restParts] = normalized.split('/');
        if (!mountName) {
          return mounts.map((mount) => `${mount}/`);
        }

        if (!mounts.includes(mountName)) {
          return mounts
            .filter((mount) => mount.toLowerCase().startsWith(lowerNormalized))
            .map((mount) => `${mount}/`);
        }

        const remainder = restParts.join('/');
        if (!remainder) {
          const paths = await services.listVaultPaths(mountName, '');
          return Array.from(new Set(paths.map((item) => `${mountName}/${item}`)));
        }

        if (input.endsWith('/')) {
          const paths = await services.listVaultPaths(mountName, remainder);
          return Array.from(new Set(paths.map((item) => `${mountName}/${item}`)));
        }

        if (!remainder.includes('/')) {
          const paths = await services.listVaultPaths(mountName, remainder);
          return Array.from(new Set(paths.map((item) => `${mountName}/${item}`)));
        }

        const lastSlash = remainder.lastIndexOf('/');
        const pathPrefix = lastSlash >= 0 ? remainder.slice(0, lastSlash) : '';
        const keyFragment = lastSlash >= 0 ? remainder.slice(lastSlash + 1) : remainder;
        const keys = await services.listVaultKeys(mountName, pathPrefix, { maskErrors: true });
        const lowerFragment = keyFragment.toLowerCase();
        return keys
          .filter((key) => (lowerFragment ? key.toLowerCase().startsWith(lowerFragment) : true))
          .map((key) => `${mountName}/${pathPrefix ? `${pathPrefix}/` : ''}${key}`);
      } catch {
        return [];
      }
    },
    [ensureVaultMounts, services],
  );

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  useGraphSocket({
    nodeIds,
    onStatus: (event) => {
      const { nodeId, updatedAt: _ignored, ...status } = event;
      applyNodeStatus(nodeId, status);
    },
    onState: (event) => {
      applyNodeState(event.nodeId, event.state ?? {});
    },
  });

  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const flowNodesRef = useRef<FlowNode[]>([]);
  const flowEdgesRef = useRef<FlowEdge[]>([]);

  const edgeTypeMap = useMemo<EdgeTypes>(() => ({ gradient: GradientEdge }), []);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    const currentSelected = selectedNodeIdRef.current;
    if (!currentSelected) {
      return;
    }
    const exists = nodes.some((node) => node.id === currentSelected);
    if (!exists) {
      setSelectedNodeId(null);
    }
  }, [nodes]);

  useEffect(() => {
    setFlowNodes((prev) =>
      nodes.map((node) => {
        const existing = prev.find((item) => item.id === node.id);
        const base = toFlowNode(node);
        if (existing) {
          base.position = existing.position;
          base.selected = existing.selected;
        }
        return base;
      }),
    );
  }, [nodes]);

  useEffect(() => {
    setFlowNodes((prev) => prev.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
  }, [selectedNodeId]);

  useEffect(() => {
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);

  useEffect(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
    const nextEdges = edges.map((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      return toFlowEdge(edge, makeEdgeData(sourceNode, targetNode));
    });
    flowEdgesRef.current = nextEdges;
    setFlowEdges(nextEdges);
  }, [edges, nodes]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const statusQuery = useNodeStatus(selectedNodeId ?? '');
  const mcpNodeId = selectedNode?.kind === 'MCP' ? selectedNode.id : null;
  const {
    tools: mcpTools,
    enabledTools: mcpEnabledTools,
    setEnabledTools: setMcpEnabledTools,
    isLoading: mcpToolsLoading,
  } = useMcpNodeState(mcpNodeId);

  const handleToggleMcpTool = useCallback(
    (toolName: string, enabled: boolean) => {
      if (!mcpNodeId) return;
      const current = mcpEnabledTools ?? [];
      const next = new Set(current);
      if (enabled) {
        next.add(toolName);
      } else {
        next.delete(toolName);
      }
      setMcpEnabledTools(Array.from(next));
    },
    [mcpEnabledTools, mcpNodeId, setMcpEnabledTools],
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      let nextSelectedId = selectedNodeIdRef.current;
      for (const change of changes) {
        if (change.type === 'select' && 'id' in change) {
          if (change.selected) {
            nextSelectedId = change.id;
          } else if (nextSelectedId === change.id) {
            nextSelectedId = null;
          }
        }
      }

      setSelectedNodeId(nextSelectedId ?? null);

      const previousNodes = flowNodesRef.current;
      const applied = applyNodeChanges(changes, previousNodes) as FlowNode[];
      const withSelection = applied.map((node) => ({
        ...node,
        selected: node.id === (nextSelectedId ?? null),
      }));
      flowNodesRef.current = withSelection;
      setFlowNodes(withSelection);

      for (const change of changes) {
        if (change.type === 'position' && (change.dragging === false || change.dragging === undefined) && 'id' in change) {
          const moved = applied.find((node) => node.id === change.id);
          if (!moved) continue;
          const { x, y } = moved.position ?? { x: 0, y: 0 };
          updateNode(change.id, { x, y });
        }
      }
    },
    [updateNode],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      const current = flowEdgesRef.current;
      const applied = applyEdgeChanges(changes, current) as FlowEdge[];
      flowEdgesRef.current = applied;
      setFlowEdges(applied);
      const shouldPersist = changes.some((change) =>
        change.type === 'remove' || change.type === 'add' || change.type === 'replace',
      );
      if (!shouldPersist) {
        return;
      }
      const nextPersisted = applied.map(fromFlowEdge);
      setEdges(nextPersisted);
    },
    [setEdges],
  );

  const handleConnect = useCallback(
    (connection: Parameters<typeof addEdge>[0]) => {
      if (!connection?.source || !connection?.target) {
        return;
      }
      const current = flowEdgesRef.current;
      const edgeId = buildEdgeId(
        connection.source,
        connection.sourceHandle ?? null,
        connection.target,
        connection.targetHandle ?? null,
      );
      if (current.some((edge) => edge.id === edgeId)) {
        return;
      }
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const edgeData = makeEdgeData(sourceNode, targetNode);
      const nextEdges = addEdge(
        { ...connection, id: edgeId, type: 'gradient', data: edgeData },
        current,
      ) as FlowEdge[];
      flowEdgesRef.current = nextEdges;
      setFlowEdges(nextEdges);
      const persisted = nextEdges.map(fromFlowEdge);
      setEdges(persisted);
    },
    [nodes, setEdges],
  );

  const sidebarStatus: GraphNodeStatus = useMemo(() => {
    const fromApi = mapProvisionState(statusQuery.data);
    if (fromApi) {
      return fromApi;
    }
    if (selectedNode?.status) {
      return selectedNode.status;
    }
    return 'not_ready';
  }, [selectedNode?.status, statusQuery.data]);

  const sidebarConfig = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    const baseConfig = selectedNode.config ?? {};
    return {
      kind: selectedNode.kind,
      title: selectedNode.title,
      ...baseConfig,
    } satisfies SidebarNodeConfig;
  }, [selectedNode]);

  const handleConfigChange = useCallback(
    (nextConfig: Partial<SidebarNodeConfig>) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;

      const updatedConfig: Record<string, unknown> = {
        kind: node.kind,
        title: node.title,
        ...(node.config ?? {}),
        ...nextConfig,
      };

      const nextTitle = typeof updatedConfig.title === 'string' ? updatedConfig.title : node.title;
      updatedConfig.kind = node.kind;
      updatedConfig.title = nextTitle;

      updateNode(nodeId, {
        config: updatedConfig,
        ...(nextTitle !== node.title ? { title: nextTitle } : {}),
      });
    },
    [nodes, updateNode],
  );

  if (loading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <div className="flex-1 relative bg-[var(--agyn-bg-light)] overflow-hidden">
        <GraphCanvas
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          edgeTypes={edgeTypeMap}
          savingStatus={savingState.status}
          savingErrorMessage={savingErrorMessage ?? undefined}
        />
      </div>
      {selectedNode && sidebarConfig ? (
        <NodePropertiesSidebar
          config={sidebarConfig}
          state={{ status: sidebarStatus }}
          onConfigChange={handleConfigChange}
          tools={mcpTools}
          enabledTools={mcpEnabledTools ?? []}
          onToggleTool={handleToggleMcpTool}
          toolsLoading={mcpToolsLoading}
          nixPackageSearch={handleNixPackageSearch}
          fetchNixPackageVersions={handleFetchNixPackageVersions}
          resolveNixPackageSelection={handleResolveNixPackageSelection}
          secretSuggestionProvider={fetchVaultSuggestions}
          variableSuggestionProvider={fetchVariableSuggestions}
          providerDebounceMs={providerDebounceMs}
        />
      ) : (
        <EmptySelectionSidebar />
      )}
    </div>
  );
}
