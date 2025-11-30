import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type EdgeTypes, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphCanvasDropHandler, type GraphNodeData } from '../GraphCanvas';
import { GradientEdge } from './edges/GradientEdge';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import NodePropertiesSidebar, { type NodeConfig as SidebarNodeConfig } from '../NodePropertiesSidebar';
import { computeAgentDefaultTitle } from '../../utils/agentDisplay';

import { useGraphData } from '@/features/graph/hooks/useGraphData';
import { useGraphSocket } from '@/features/graph/hooks/useGraphSocket';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import { useNodeAction } from '@/features/graph/hooks/useNodeAction';
import { useMcpNodeState, useTemplates } from '@/lib/graph/hooks';
import { mapTemplatesToSidebarItems } from '@/lib/graph/sidebarNodeItems';
import { buildGraphNodeFromTemplate } from '@/features/graph/mappers';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge } from '@/features/graph/types';
import type { TemplateSchema, NodeStatus as ApiNodeStatus } from '@/api/types/graph';

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
const ACTION_GUARD_INTERVAL_MS = 600;

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

function resolveAgentDisplayTitle(node: GraphNodeConfig): string {
  const config = (node.config ?? {}) as Record<string, unknown>;
  const rawConfigTitle = typeof config.title === 'string' ? config.title : '';
  const trimmedConfigTitle = rawConfigTitle.trim();
  if (trimmedConfigTitle.length > 0) {
    return trimmedConfigTitle;
  }

  const fallbackTemplate =
    typeof node.template === 'string' && node.template.trim().length > 0 ? node.template.trim() : 'Agent';
  const basePlaceholder = computeAgentDefaultTitle(undefined, undefined, 'Agent');
  const storedTitleRaw = typeof node.title === 'string' ? node.title : '';
  const storedTitle = storedTitleRaw.trim();
  const profileFallback = computeAgentDefaultTitle(
    typeof config.name === 'string' ? (config.name as string) : undefined,
    typeof config.role === 'string' ? (config.role as string) : undefined,
    fallbackTemplate,
  );
  const isPlaceholderTitle =
    storedTitle.length > 0 &&
    (storedTitle === basePlaceholder || storedTitle === fallbackTemplate || storedTitle === node.template);

  if (storedTitle.length > 0 && !isPlaceholderTitle) {
    return storedTitle;
  }

  if (profileFallback.length > 0) {
    return profileFallback;
  }

  if (storedTitle.length > 0) {
    return storedTitle;
  }

  return basePlaceholder;
}

function resolveDisplayTitle(node: GraphNodeConfig): string {
  if (node.kind === 'Agent') {
    return resolveAgentDisplayTitle(node);
  }
  const rawTitle = typeof node.title === 'string' ? node.title : '';
  const trimmed = rawTitle.trim();
  return trimmed.length > 0 ? trimmed : rawTitle;
}

function toFlowNode(node: GraphNodeConfig): FlowNode {
  return {
    id: node.id,
    type: 'graphNode',
    position: { x: node.x, y: node.y },
    data: {
      kind: node.kind,
      title: resolveDisplayTitle(node),
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

function generateGraphNodeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to fallback
  }
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `node-${timestamp}-${random}`;
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
    removeNodes,
    addNode,
    scheduleSave,
  } = useGraphData();

  const providerDebounceMs = 275;
  const vaultMountsRef = useRef<string[] | null>(null);
  const vaultMountsPromiseRef = useRef<Promise<string[]> | null>(null);
  const variableKeysRef = useRef<string[]>([]);
  const variableKeysPromiseRef = useRef<Promise<string[]> | null>(null);
  const updateNodeRef = useRef(updateNode);
  const setEdgesRef = useRef(setEdges);
  const nodesRef = useRef(nodes);

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

  useEffect(() => {
    updateNodeRef.current = updateNode;
  }, [updateNode]);

  useEffect(() => {
    setEdgesRef.current = setEdges;
  }, [setEdges]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
  const lastActionAtRef = useRef<number>(0);

  const edgeTypes = useMemo<EdgeTypes>(() => ({ gradient: GradientEdge }), []);
  const fallbackEnabledTools = useMemo<string[]>(() => [], []);
  const templatesQuery = useTemplates();
  const sidebarNodeItems = useMemo(() => mapTemplatesToSidebarItems(templatesQuery.data), [templatesQuery.data]);
  const templatesByName = useMemo(() => {
    if (!Array.isArray(templatesQuery.data) || templatesQuery.data.length === 0) {
      return null;
    }
    const map = new Map<string, TemplateSchema>();
    for (const tpl of templatesQuery.data) {
      if (!tpl || typeof tpl !== 'object') {
        continue;
      }
      const name = typeof tpl.name === 'string' ? tpl.name.trim() : '';
      if (!name) {
        continue;
      }
      map.set(name, tpl);
    }
    return map.size > 0 ? map : null;
  }, [templatesQuery.data]);
  const canAcceptDrop = !templatesQuery.isLoading && !!templatesByName && templatesByName.size > 0;
  const sidebarStatusMessage = useMemo(() => {
    if (templatesQuery.isLoading) {
      return 'Loading templates...';
    }
    if (templatesQuery.isError && sidebarNodeItems.length === 0) {
      return 'Failed to load templates.';
    }
    if (!templatesQuery.isLoading && sidebarNodeItems.length === 0) {
      return 'No templates available.';
    }
    return undefined;
  }, [sidebarNodeItems.length, templatesQuery.isError, templatesQuery.isLoading]);

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
    setFlowNodes((prev) => {
      const prevById = new Map(prev.map((item) => [item.id, item] as const));
      let changed = prev.length !== nodes.length;
      const next: FlowNode[] = nodes.map((node, index) => {
        const existing = prevById.get(node.id);
        const nextData = {
          kind: node.kind,
          title: resolveDisplayTitle(node),
          inputs: node.ports.inputs,
          outputs: node.ports.outputs,
          avatarSeed: node.avatarSeed,
        } satisfies FlowNode['data'];
        if (!existing) {
          changed = true;
          return toFlowNode(node);
        }
        const basePosition = existing.position ?? { x: node.x, y: node.y };
        const dataMatches =
          existing.data.kind === nextData.kind &&
          existing.data.title === nextData.title &&
          existing.data.avatarSeed === nextData.avatarSeed &&
          existing.data.inputs === nextData.inputs &&
          existing.data.outputs === nextData.outputs;
        const positionMatches =
          existing.position?.x === basePosition.x && existing.position?.y === basePosition.y;
        let nextNode = existing;
        if (!dataMatches) {
          nextNode = {
            ...existing,
            data: nextData,
          } satisfies FlowNode;
        }
        if (!positionMatches) {
          nextNode = {
            ...nextNode,
            position: basePosition,
          } satisfies FlowNode;
        }
        if (nextNode !== existing) {
          changed = true;
        }
        if (!changed && prev[index]?.id !== node.id) {
          changed = true;
        }
        return nextNode;
      });
      if (!changed) {
        return prev;
      }
      return next;
    });
  }, [nodes]);

  useEffect(() => {
    setFlowNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        const shouldSelect = node.id === selectedNodeId;
        if (node.selected === shouldSelect) {
          return node;
        }
        changed = true;
        return { ...node, selected: shouldSelect };
      });
      if (!changed) {
        return prev;
      }
      return next;
    });
  }, [selectedNodeId]);

  useEffect(() => {
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);

  useEffect(() => {
    setFlowEdges((prev) => {
      const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
      const nextEdges = edges.map((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        return toFlowEdge(edge, makeEdgeData(sourceNode, targetNode));
      });
      const prevLength = prev.length;
      if (prevLength === nextEdges.length) {
        let changed = false;
        for (let index = 0; index < prevLength; index += 1) {
          const prevEdge = prev[index];
          const nextEdge = nextEdges[index];
          if (prevEdge.id !== nextEdge.id) {
            changed = true;
            break;
          }
          const prevData = prevEdge.data;
          const nextData = nextEdge.data;
          if (prevData === nextData) {
            continue;
          }
          if (!prevData || !nextData) {
            changed = true;
            break;
          }
          if (
            prevData.sourceColor !== nextData.sourceColor ||
            prevData.targetColor !== nextData.targetColor ||
            prevData.sourceKind !== nextData.sourceKind ||
            prevData.targetKind !== nextData.targetKind
          ) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          flowEdgesRef.current = prev;
          return prev;
        }
      }
      flowEdgesRef.current = nextEdges;
      return nextEdges;
    });
  }, [edges, nodes]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const statusQuery = useNodeStatus(selectedNodeId ?? '');
  const actionNodeId = selectedNode?.id ?? null;
  const nodeAction = useNodeAction(actionNodeId);
  const { mutateAsync: runNodeAction, isPending: isActionPending } = nodeAction;
  const { refetch: refetchStatus } = statusQuery;
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

  const handleNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    let nextSelectedId = selectedNodeIdRef.current;
    const removedIds: string[] = [];
    for (const change of changes) {
      if (change.type === 'select' && 'id' in change) {
        if (change.selected) {
          nextSelectedId = change.id;
        } else if (nextSelectedId === change.id) {
          nextSelectedId = null;
        }
      }

      if (change.type === 'remove' && 'id' in change) {
        removedIds.push(change.id);
        if (nextSelectedId === change.id) {
          nextSelectedId = null;
        }
      }
    }

    setSelectedNodeId(nextSelectedId ?? null);

    const previousNodes = flowNodesRef.current;
    const applied = applyNodeChanges(changes, previousNodes) as FlowNode[];
    if (applied !== previousNodes) {
      flowNodesRef.current = applied;
      setFlowNodes(applied);
    }

    if (removedIds.length > 0) {
      removeNodes(removedIds);
    }

    for (const change of changes) {
      if (change.type === 'position' && (change.dragging === false || change.dragging === undefined) && 'id' in change) {
        const moved = applied.find((node) => node.id === change.id);
        if (!moved) continue;
        const { x, y } = moved.position ?? { x: 0, y: 0 };
        updateNodeRef.current(change.id, { x, y });
      }
    }
  }, [removeNodes]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges>[0]) => {
    const current = flowEdgesRef.current;
    const applied = applyEdgeChanges(changes, current) as FlowEdge[];
    if (applied !== current) {
      flowEdgesRef.current = applied;
      setFlowEdges(applied);
    }
    const shouldPersist = changes.some((change) =>
      change.type === 'remove' || change.type === 'add' || change.type === 'replace',
    );
    if (!shouldPersist) {
      return;
    }
    const nextPersisted = applied.map(fromFlowEdge);
    setEdgesRef.current(nextPersisted);
  }, []);

  const handleConnect = useCallback((connection: Parameters<typeof addEdge>[0]) => {
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
    const nodeList = nodesRef.current;
    const sourceNode = nodeList.find((node) => node.id === connection.source);
    const targetNode = nodeList.find((node) => node.id === connection.target);
    const edgeData = makeEdgeData(sourceNode, targetNode);
    const nextEdges = addEdge(
      { ...connection, id: edgeId, type: 'gradient', data: edgeData },
      current,
    ) as FlowEdge[];
    flowEdgesRef.current = nextEdges;
    setFlowEdges(nextEdges);
    const persisted = nextEdges.map(fromFlowEdge);
    setEdgesRef.current(persisted);
  }, []);

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

  const canProvision =
    sidebarStatus === 'not_ready' ||
    sidebarStatus === 'provisioning_error' ||
    sidebarStatus === 'deprovisioning_error';

  const canDeprovision = sidebarStatus === 'ready' || sidebarStatus === 'provisioning';

  const sidebarEntry = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    const baseConfig = (selectedNode.config ?? {}) as Record<string, unknown>;
    const rawTitleFromConfig = typeof baseConfig.title === 'string' ? (baseConfig.title as string) : null;
    const resolvedTitle =
      rawTitleFromConfig ?? (typeof selectedNode.title === 'string' ? selectedNode.title : '');

    const config: SidebarNodeConfig = {
      ...baseConfig,
      kind: selectedNode.kind,
      title: resolvedTitle,
      template: selectedNode.template,
    };

    return {
      config,
      displayTitle: resolveDisplayTitle(selectedNode),
    };
  }, [selectedNode]);

  const sidebarConfig = sidebarEntry?.config ?? null;
  const sidebarDisplayTitle = sidebarEntry?.displayTitle ?? '';

  const sidebarState = useMemo(() => ({ status: sidebarStatus }), [sidebarStatus]);

  const handleConfigChange = useCallback(
    (nextConfig: Partial<SidebarNodeConfig>) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) return;

      const baseConfig = { ...(node.config ?? {}) } as Record<string, unknown>;
      delete baseConfig.kind;
      delete baseConfig.title;
      delete baseConfig.template;

      const patch = { ...(nextConfig ?? {}) } as Record<string, unknown>;
      const rawTitleUpdate = typeof patch.title === 'string' ? (patch.title as string) : undefined;
      delete patch.kind;
      delete patch.title;
      delete patch.template;

      const updatedConfig: Record<string, unknown> = {
        ...baseConfig,
        ...patch,
      };

      const updates: { config: Record<string, unknown>; title?: string } = {
        config: updatedConfig,
      };

      if (rawTitleUpdate !== undefined) {
        const trimmedTitle = rawTitleUpdate.trim();
        const currentTitle = typeof node.title === 'string' ? node.title : '';
        if (trimmedTitle !== currentTitle) {
          updates.title = trimmedTitle;
        }
      }

      updateNodeRef.current(nodeId, updates);
    },
    [],
  );

  const handleNodeAction = useCallback(
    (action: 'provision' | 'deprovision') => {
      if (!actionNodeId) return;
      if (isActionPending) return;
      const now = Date.now();
      if (now - lastActionAtRef.current < ACTION_GUARD_INTERVAL_MS) {
        return;
      }
      lastActionAtRef.current = now;
      void runNodeAction(action).finally(() => {
        if (actionNodeId) {
          void refetchStatus();
        }
      });
    },
    [actionNodeId, isActionPending, refetchStatus, runNodeAction],
  );

  const handleProvision = useCallback(() => {
    handleNodeAction('provision');
  }, [handleNodeAction]);

  const handleDeprovision = useCallback(() => {
    handleNodeAction('deprovision');
  }, [handleNodeAction]);

  const handleDrop = useCallback<GraphCanvasDropHandler>((_event, { data, position }) => {
    if (!templatesByName) {
      return;
    }
    const template = templatesByName.get(data.id);
    if (!template) {
      return;
    }
    const x = Number.isFinite(position?.x) ? position.x : 0;
    const y = Number.isFinite(position?.y) ? position.y : 0;
    const nodeId = generateGraphNodeId();
    const rawTitle = typeof data.title === 'string' ? data.title.trim() : '';
    const config = rawTitle.length > 0 ? { title: rawTitle } : undefined;
    const { node, metadata } = buildGraphNodeFromTemplate(template, {
      id: nodeId,
      position: { x, y },
      title: rawTitle || undefined,
      config,
    });

    addNode(node, metadata);
    scheduleSave();
  }, [addNode, scheduleSave, templatesByName]);

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
          edgeTypes={edgeTypes}
          onDrop={canAcceptDrop ? handleDrop : undefined}
          savingStatus={savingState.status}
          savingErrorMessage={savingErrorMessage ?? undefined}
        />
      </div>
      {selectedNode && sidebarConfig ? (
        <NodePropertiesSidebar
          config={sidebarConfig}
          state={sidebarState}
          displayTitle={sidebarDisplayTitle}
          onConfigChange={handleConfigChange}
          onProvision={handleProvision}
          onDeprovision={handleDeprovision}
          canProvision={canProvision}
          canDeprovision={canDeprovision}
          isActionPending={isActionPending}
          tools={mcpTools}
          enabledTools={mcpEnabledTools ?? fallbackEnabledTools}
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
        <EmptySelectionSidebar nodeItems={sidebarNodeItems} statusMessage={sidebarStatusMessage} />
      )}
    </div>
  );
}
