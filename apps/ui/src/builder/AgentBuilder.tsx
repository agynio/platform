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
import { NodeObsSidebar } from '@/components/graph/NodeObsSidebar';
import { RightPropertiesPanel } from './panels/RightPropertiesPanel';
import { useBuilderState } from './hooks/useBuilderState';
import type { BuilderNodeKind } from './types';
import type { TemplateNodeSchema } from 'shared';
import { getDisplayTitle } from './lib/display';
import { Button, Popover, PopoverTrigger, PopoverContent, ScrollArea, Card } from '@hautech/ui';
import { Plus } from 'lucide-react';
import { kindBadgeClasses, kindLabel } from './lib/display';

interface CanvasAreaProps {
  nodes: RFNode[];
  edges: RFEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (kind: BuilderNodeKind, position: { x: number; y: number }) => void;
  deleteSelected: () => void;
  nodeTypes: NodeTypes; // reactflow's NodeTypes value type
  templates: TemplateNodeSchema[];
  saveState: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
}

function CanvasArea({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  addNode,
  deleteSelected,
  nodeTypes,
  templates,
  saveState,
}: CanvasAreaProps) {
  const flowWrapper = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow();
  const [open, setOpen] = useState(false);

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
  const insertAtViewportCenter = useCallback(
    (templateName: string) => {
      if (!flowWrapper.current) return;
      const bounds = flowWrapper.current.getBoundingClientRect();
      // Use wrapper-relative center and project to graph coordinates
      const center = { x: bounds.width / 2, y: bounds.height / 2 };
      const projected = reactFlow.project(center);
      addNode(templateName, projected);
    },
    [reactFlow, addNode],
  );

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
      {/* Top-left overlay: Fit + Save state indicator */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="pointer-events-auto text-[10px]"
          onClick={() => reactFlow.fitView()}
        >
          Fit
        </Button>
        <div className="text-[10px] text-muted-foreground" aria-live="polite">
          Save: {saveState}
        </div>
      </div>

      {/* Bottom-center add button and popover */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="default"
              size="icon"
              type="button"
              aria-label="Add node"
              className="pointer-events-auto"
              data-testid="add-node-button"
            >
              <Plus />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-[720px] max-w-[90vw] p-2" aria-labelledby="add-node-title">
            <h2 id="add-node-title" className="sr-only">Add node</h2>
            <ScrollArea className="max-h-[60vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 p-1">
                {templates.map((tpl) => (
                  <Card key={tpl.name} className="p-0">
                    <button
                      type="button"
                      className="w-full rounded-lg p-3 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        insertAtViewportCenter(tpl.name);
                        setOpen(false);
                      }}
                      aria-label={`Insert ${tpl.title || tpl.name}`}
                      data-testid={`template-${tpl.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] leading-none ${kindBadgeClasses(tpl.kind)}`}>
                          {kindLabel(tpl.kind)}
                        </span>
                        <span className="text-sm font-medium text-primary">{tpl.title || tpl.name}</span>
                      </div>
                    </button>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
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
    saveState,
  } = useBuilderState();
  const nodeTypes = useMemo(() => makeNodeTypes(templates), [templates]);
  const [rightTab, setRightTab] = useState<'properties' | 'activity'>('properties');

  // Eligibility: show tabs for agent or tool nodes
  // Keep callback stable and declare before any effects that reference it to avoid TDZ issues.
  const isActivityEligible = useCallback((node: RFNode | null, tpls: TemplateNodeSchema[]): boolean => {
    if (!node) return false;
    const tpl = tpls.find((t) => t.name === node.data.template);
    const kind = tpl?.kind; // TemplateKind union
    if (kind === 'agent' || kind === 'tool') return true;
    // Fallback: template name conventions from prior PR
    if (/agent/i.test(node.data.template)) return true;
    return false; // treat others as ineligible
  }, []);

  // Reset tab when selection changes or if selected node no longer supports activity view
  useEffect(() => {
    if (!selectedNode) {
      setRightTab('properties');
      return;
    }
    // If node not eligible for Activity, reset
    if (!isActivityEligible(selectedNode, templates) && rightTab === 'activity') {
      setRightTab('properties');
    }
  }, [selectedNode, rightTab, isActivityEligible, templates]);
  const activityEligible = isActivityEligible(selectedNode, templates);
  const selectedDisplayTitle = selectedNode
    ? getDisplayTitle(templates, selectedNode.data.template, selectedNode.data.config)
    : 'No Selection';

  return (
    <DndProvider backend={HTML5Backend}>
      <ReactFlowProvider>
        <div className="h-svh w-svw flex overflow-hidden">
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
              templates={templates}
              saveState={saveState}
            />
          </TemplatesProvider>
          <aside className="w-96 shrink-0 border-l bg-sidebar p-0 flex flex-col overflow-hidden">
            <div className="border-b flex items-center gap-2 px-4 h-10">
              <div className="text-xs font-semibold tracking-wide">{selectedDisplayTitle}</div>
              {activityEligible && (
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="sm" variant={rightTab === 'properties' ? 'default' : 'secondary'} onClick={() => setRightTab('properties')}>
                    Props
                  </Button>
                  <Button type="button" size="sm" variant={rightTab === 'activity' ? 'default' : 'secondary'} onClick={() => setRightTab('activity')}>
                    Activity
                  </Button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === 'activity' && activityEligible && selectedNode ? (
                <div className="space-y-4">
                  {/* Show OBS spans for agent/tool nodes */}
                  <NodeObsSidebar node={selectedNode} />
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
