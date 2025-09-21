import { useCallback, useRef } from 'react';
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
import { nodeTypes } from './nodeTypes';
import { LeftPalette } from './panels/LeftPalette';
import { RightPropertiesPanel } from './panels/RightPropertiesPanel';
import { useBuilderState } from './hooks/useBuilderState';
import type { BuilderNodeKind } from './types';

interface CanvasAreaProps {
  nodes: RFNode[];
  edges: RFEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (kind: BuilderNodeKind, position: { x: number; y: number }) => void;
  deleteSelected: () => void;
}

function CanvasArea({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  addNode,
  deleteSelected,
}: CanvasAreaProps) {
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
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectedNode,
    updateNodeData,
    deleteSelected,
    templates,
    loading,
    saveState,
  } = useBuilderState();
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
          <CanvasArea
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            addNode={addNode}
            deleteSelected={deleteSelected}
          />
          <aside className="w-72 shrink-0 border-l bg-sidebar p-4 overflow-y-auto">
            <div className="sticky top-0">
              <h2 className="mb-3 text-sm font-semibold">Properties</h2>
              <RightPropertiesPanel node={selectedNode} onChange={updateNodeData} />
            </div>
          </aside>
        </div>
      </ReactFlowProvider>
    </DndProvider>
  );
}
