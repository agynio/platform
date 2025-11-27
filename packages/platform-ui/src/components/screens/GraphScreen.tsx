import { useCallback, useMemo, useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { addEdge, applyEdgeChanges, applyNodeChanges, BaseEdge, getBezierPath } from '@xyflow/react';
import type { Edge, EdgeProps, EdgeTypes, Node } from '@xyflow/react';

import NodePropertiesSidebar from '../NodePropertiesSidebar';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import { IconButton } from '../IconButton';
import { GraphCanvas, type GraphCanvasDropContext, type GraphNodeData } from '../GraphCanvas';
import type { NodeKind } from '../Node';
import type { SavingStatus } from '../SavingStatusControl';

const nodeKindToColor: Record<NodeKind, string> = {
  Trigger: 'var(--agyn-yellow)',
  Agent: 'var(--agyn-blue)',
  Tool: 'var(--agyn-cyan)',
  MCP: 'var(--agyn-cyan)',
  Workspace: 'var(--agyn-purple)',
};

type NodeStatus =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

function GradientEdge(props: EdgeProps<Edge>) {
  const [edgePath] = getBezierPath(props);
  const { source, target, data } = props;
  const edgeData = (data ?? {}) as Record<string, unknown>;
  const sourceColor = typeof edgeData.sourceColor === 'string' ? edgeData.sourceColor : 'var(--agyn-blue)';
  const targetColor = typeof edgeData.targetColor === 'string' ? edgeData.targetColor : 'var(--agyn-purple)';

  return (
    <>
      <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <linearGradient
            id={`graph-gradient-edge-${source}-${target}`}
            gradientUnits="userSpaceOnUse"
            x1={props.sourceX}
            y1={props.sourceY}
            x2={props.targetX}
            y2={props.targetY}
          >
            <stop offset="0%" stopColor={sourceColor} />
            <stop offset="100%" stopColor={targetColor} />
          </linearGradient>
        </defs>
      </svg>
      <BaseEdge
        path={edgePath}
        style={{ stroke: `url(#graph-gradient-edge-${source}-${target})`, strokeWidth: 2 }}
      />
    </>
  );
}

export interface GraphNodeConfig {
  id: string;
  template?: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  status: NodeStatus;
  data?: Record<string, unknown>;
  avatarSeed?: string;
}

interface GraphScreenProps {
  nodes: GraphNodeConfig[];
  onBack?: () => void;
  savingStatus?: SavingStatus;
  savingErrorMessage?: string;
  onNodeUpdate?: (nodeId: string, updates: Partial<GraphNodeConfig>) => void;
}

export default function GraphScreen({ 
  nodes: initialNodesConfig, 
  onBack,
  savingStatus = 'saved',
  savingErrorMessage,
  onNodeUpdate,
}: GraphScreenProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const nodeConfigs = initialNodesConfig;

  const initialFlowNodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      nodeConfigs.map((n) => ({
        id: n.id,
        type: 'graphNode',
        position: { x: n.x, y: n.y },
        data: {
          kind: n.kind,
          title: n.title,
          avatarSeed: n.avatarSeed,
          // Simple, fixed ports per kind to demonstrate connections
          inputs:
            n.kind === 'Trigger'
              ? []
              : n.kind === 'Workspace'
              ? [
                  { id: `${n.id}-in-config`, title: 'CONFIG' },
                  { id: `${n.id}-in-artifacts`, title: 'ARTIFACTS' },
                ]
              : [{ id: `${n.id}-in`, title: 'IN' }],
          outputs:
            n.kind === 'Workspace'
              ? []
              : [{ id: `${n.id}-out`, title: 'OUT' }],
        },
      })),
    [nodeConfigs],
  );

  const initialFlowEdges = useMemo<Edge[]>(
    () => [
      {
        id: 'e-1-2',
        type: 'gradient',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'node-1-out',
        targetHandle: 'node-2-in',
        data: { sourceColor: nodeKindToColor.Trigger, targetColor: nodeKindToColor.Agent },
      },
      {
        id: 'e-2-3',
        type: 'gradient',
        source: 'node-2',
        target: 'node-3',
        sourceHandle: 'node-2-out',
        targetHandle: 'node-3-in',
        data: { sourceColor: nodeKindToColor.Agent, targetColor: nodeKindToColor.Tool },
      },
      {
        id: 'e-4-5',
        type: 'gradient',
        source: 'node-4',
        target: 'node-5',
        sourceHandle: 'node-4-out',
        targetHandle: 'node-5-in-config',
        data: { sourceColor: nodeKindToColor.MCP, targetColor: nodeKindToColor.Workspace },
      },
      {
        id: 'e-3-5-artifacts',
        type: 'gradient',
        source: 'node-3',
        target: 'node-5',
        sourceHandle: 'node-3-out',
        targetHandle: 'node-5-in-artifacts',
        data: { sourceColor: nodeKindToColor.Tool, targetColor: nodeKindToColor.Workspace },
      },
      {
        id: 'e-5-6',
        type: 'gradient',
        source: 'node-5',
        target: 'node-6',
        sourceHandle: 'node-5-out',
        targetHandle: 'node-6-in',
        data: { sourceColor: nodeKindToColor.Workspace, targetColor: nodeKindToColor.Agent },
      },
    ],
    [],
  );

  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>(initialFlowNodes);
  const [edges, setEdges] = useState<Edge[]>(initialFlowEdges);
  const edgeTypeMap = useMemo<EdgeTypes>(() => ({ gradient: GradientEdge }), []);

  // Update nodes when nodeConfigs change (e.g., title updates)
  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        const config = nodeConfigs.find((n) => n.id === node.id);
        if (config) {
          return {
            ...node,
            data: {
              ...node.data,
              title: config.title,
              kind: config.kind,
              avatarSeed: config.avatarSeed,
            },
          };
        }
        return node;
      })
    );
  }, [nodeConfigs]);

  const selectedNode = nodeConfigs.find((node) => node.id === selectedNodeId);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as Node<GraphNodeData>[]);

      // Reflect selection into sidebar when a node is selected in the canvas
      const selectedChange = changes.find((c) => c.type === 'select');
      if (selectedChange && 'id' in selectedChange) {
        setSelectedNodeId(selectedChange.selected ? selectedChange.id : null);
      }
    },
    [],
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback(
    (connection: Parameters<typeof addEdge>[0]) =>
      setEdges((eds) => addEdge(connection, eds)),
    [],
  );

  const onDrop = useCallback((
    _event: React.DragEvent<HTMLDivElement>,
    { data: nodeData, position: flowPosition }: GraphCanvasDropContext,
  ) => {
    if (!nodeData || !flowPosition) {
      return;
    }

    const newNodeId = `node-${Date.now()}`;
    const newNode: Node<GraphNodeData> = {
      id: newNodeId,
      type: 'graphNode',
      position: flowPosition,
      data: {
        kind: nodeData.kind,
        title: nodeData.title,
        inputs:
          nodeData.kind === 'Trigger'
            ? []
            : nodeData.kind === 'Workspace'
            ? [
                { id: `${newNodeId}-in-config`, title: 'CONFIG' },
                { id: `${newNodeId}-in-artifacts`, title: 'ARTIFACTS' },
              ]
            : [{ id: `${newNodeId}-in`, title: 'IN' }],
        outputs:
          nodeData.kind === 'Workspace'
            ? []
            : [{ id: `${newNodeId}-out`, title: 'OUT' }],
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Graph</span>
        </div>
      )}

      {/* Main Screen Content (canvas only, layout provides sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative bg-[var(--agyn-bg-light)] overflow-hidden">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            edgeTypes={edgeTypeMap}
            savingStatus={savingStatus}
            savingErrorMessage={savingErrorMessage}
          />
        </div>

        {/* Right Sidebar - Node Properties or Empty State */}
        {selectedNode ? (
          <NodePropertiesSidebar
            config={{
              kind: selectedNode.kind,
              title: selectedNode.title,
              ...selectedNode.data,
            }}
            state={{
              status: selectedNode.status,
            }}
            template={selectedNode.template}
            onConfigChange={
              onNodeUpdate
                ? (updates) => {
                    onNodeUpdate(selectedNode.id, updates);
                  }
                : undefined
            }
          />
        ) : (
          <EmptySelectionSidebar />
        )}
      </div>
    </div>
  );
}
