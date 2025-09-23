import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
  SelectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DND_ITEM_NODE } from './dnd';
import { makeNodeTypes } from './nodeTypes';
import { TemplatesProvider } from './TemplatesProvider';
import type { NodeTypes } from 'reactflow';
import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';
import { LeftPalette } from './panels/LeftPalette';
import { RightPropertiesPanel } from './panels/RightPropertiesPanel';
import { useBuilderState } from './hooks/useBuilderState';
import type { BuilderNodeKind } from './types';
import { getDisplayTitle } from './lib/display';

interface CanvasAreaProps {
  nodes: RFNode[];
  edges: RFEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (kind: BuilderNodeKind, position: { x: number; y: number }) => void;
  deleteSelected: () => void;
  nodeTypes: NodeTypes; // reactflow's NodeTypes value type
}

function CanvasArea({ nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, deleteSelected, nodeTypes }: CanvasAreaProps) {
  const flowWrapper = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow();

  const [{ isOver }, dropRef] = useDrop(
    () => ({
      accept: DND_ITEM_NODE,
      drop: (item: { kind: BuilderNodeKind }, monitor) => {
        const client = monitor.getClientOffset();
        if (!client || !flowWrapper.current) return;
        const bounds = flowWrapper.current.getBoundingClientRect();
        const position = reactFlow.project({ x: client.x - bounds.left, y: client.y - bounds.top });
        addNode(item.kind, position);
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    }),
    [reactFlow, addNode],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        reactFlow.fitView();
      }
    },
    [deleteSelected, reactFlow],
  );

  const setDropRef = (el: HTMLDivElement | null) => {
    if (el) dropRef(el);
  };
  return (
    <div ref={setDropRef} className="relative flex-1" onKeyDown={onKeyDown} tabIndex={0}>
      <div ref={flowWrapper} className={`absolute inset-0 ${isOver ? 'ring-2 ring-primary/40' : ''}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          panOnScroll
          panOnScrollSpeed={2}
          selectionOnDrag
          panOnDrag={[1]}
          selectionMode={SelectionMode.Partial}
          fitView
        >
          <Background gap={16} size={1} />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-2">
        <button
          type="button"
          className="pointer-events-auto rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground shadow"
          onClick={() => reactFlow.fitView()}
        >
          Fit
        </button>
      </div>
    </div>
  );
}

export function AgentBuilder() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, selectedNode, updateNodeData, deleteSelected, templates, loading, saveState } = useBuilderState();
  const nodeTypes = useMemo(() => makeNodeTypes(templates), [templates]);
  const [rightTab, setRightTab] = useState<'properties' | 'checkpoint'>('properties');

  // Reset tab when selection changes or if selected node no longer supports checkpoint view
  useEffect(() => {
    if (!selectedNode) {
      setRightTab('properties');
      return;
    }
    const tpl = selectedNode.data.template;
    if (tpl !== 'simpleAgent' && rightTab === 'checkpoint') {
      setRightTab('properties');
    }
  }, [selectedNode, rightTab]);

  const isCheckpointEligible = selectedNode?.data.template === 'simpleAgent';
  const selectedDisplayTitle = selectedNode
    ? getDisplayTitle(templates, selectedNode.data.template, selectedNode.data.config)
    : 'No Selection';

  return (
    <DndProvider backend={HTML5Backend}>
      <ReactFlowProvider>
        <div className="h-svh w-svw flex overflow-hidden">
          <aside className="w-56 shrink-0 border-r bg-sidebar p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Palette</span>
              <span className="text-[10px] font-medium">{loading ? 'Loading' : templates.length}</span>
            </div>
            <LeftPalette templates={templates} />
            <div className="mt-4 text-[10px] text-muted-foreground">Save: {saveState}</div>
          </aside>
          <TemplatesProvider templates={templates}>
            <CanvasArea
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              addNode={addNode}
              deleteSelected={deleteSelected}
              nodeTypes={nodeTypes}
            />
          </TemplatesProvider>
          <aside className="w-96 shrink-0 border-l bg-sidebar p-0 flex flex-col overflow-hidden">
            <div className="border-b flex items-center gap-2 px-4 h-10">
              <div className="text-xs font-semibold tracking-wide">{selectedDisplayTitle}</div>
              {isCheckpointEligible && (
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => setRightTab('properties')}
                    className={`px-2 py-1 text-[11px] rounded ${rightTab==='properties' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                  >Props</button>
                  <button
                    type="button"
                    onClick={() => setRightTab('checkpoint')}
                    className={`px-2 py-1 text-[11px] rounded ${rightTab==='checkpoint' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                  >Checkpoint</button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === 'checkpoint' && isCheckpointEligible ? (
                <div className="space-y-4">
                  <div className="text-[10px] uppercase text-muted-foreground">Checkpoint Stream</div>
                  <CheckpointStreamPanel agentId={selectedNode?.id} />
                </div>
              ) : (
                <RightPropertiesPanel node={selectedNode} onChange={updateNodeData} />
              )}
            </div>
          </aside>
        </div>
      </ReactFlowProvider>
    </DndProvider>
  );
}
