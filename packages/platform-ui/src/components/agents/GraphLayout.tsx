import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../GraphCanvas';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import NodePropertiesSidebar, { type NodeConfig as SidebarNodeConfig } from '../NodePropertiesSidebar';

import { useGraphData } from '@/features/graph/hooks/useGraphData';
import { useGraphSocket } from '@/features/graph/hooks/useGraphSocket';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge } from '@/features/graph/types';
import type { NodeStatus as ApiNodeStatus } from '@/api/types/graph';

type FlowNode = Node<GraphNodeData>;

function toFlowNode(node: GraphNodeConfig, selectedId: string | null): FlowNode {
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
    selected: node.id === selectedId,
  } satisfies FlowNode;
}

function toFlowEdge(edge: GraphPersistedEdge): Edge {
  const id = `${edge.source}-${edge.sourceHandle ?? '$'}__${edge.target}-${edge.targetHandle ?? '$'}`;
  return {
    id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
  } satisfies Edge;
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

export function GraphLayout() {
  const {
    nodes,
    edges,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    applyNodeState,
  } = useGraphData();

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
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId && nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
      return;
    }
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    setFlowNodes((prev) => {
      return nodes.map((node) => {
        const existing = prev.find((item) => item.id === node.id);
        const base = toFlowNode(node, selectedNodeIdRef.current);
        if (existing) {
          base.position = existing.position;
        }
        return base;
      });
    });
  }, [nodes]);

  useEffect(() => {
    setFlowNodes((prev) => prev.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
  }, [selectedNodeId]);

  useEffect(() => {
    setFlowEdges(edges.map(toFlowEdge));
  }, [edges]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const statusQuery = useNodeStatus(selectedNodeId ?? '');

  const handleNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    let nextSelectedId = selectedNodeIdRef.current;
    for (const change of changes) {
      if (change.type === 'select' && 'id' in change) {
        nextSelectedId = change.selected ? change.id : null;
      }
    }
    setSelectedNodeId(nextSelectedId ?? null);
    setFlowNodes((prev) => {
      const applied = applyNodeChanges(changes, prev) as FlowNode[];
      return applied.map((node) => ({ ...node, selected: node.id === (nextSelectedId ?? null) }));
    });
  }, []);

  const handleEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges>[0]) => {
    setFlowEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const handleConnect = useCallback((connection: Parameters<typeof addEdge>[0]) => {
    setFlowEdges((prev) => addEdge(connection, prev));
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
          savingStatus={savingState.status}
          savingErrorMessage={savingErrorMessage ?? undefined}
        />
      </div>
      {selectedNode && sidebarConfig ? (
        <NodePropertiesSidebar
          config={sidebarConfig}
          state={{ status: sidebarStatus }}
          onConfigChange={handleConfigChange}
        />
      ) : (
        <EmptySelectionSidebar />
      )}
    </div>
  );
}
