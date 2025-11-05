import { useCallback, useRef, useMemo, useState, useEffect, forwardRef, memo } from 'react';
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
import type { DragItem } from './dnd';
import { makeNodeTypes } from './nodeTypes';
import { TemplatesProvider } from './TemplatesProvider';
import type { NodeTypes } from 'reactflow';
import { NodeObsSidebar } from '@/components/graph/NodeObsSidebar';
import { RightPropertiesPanel } from './panels/RightPropertiesPanel';
import { useBuilderState } from './hooks/useBuilderState';
import type { TemplateNodeSchema } from '@agyn/shared';
import { getDisplayTitle } from './lib/display';
import { Button, Popover, PopoverTrigger, PopoverContent, ScrollArea, Card, Drawer, DrawerTrigger, DrawerContent } from '@agyn/ui';
import { Plus, Bot, Wrench, Zap } from 'lucide-react';
import { kindBadgeClasses, kindLabel } from './lib/display';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { useDrag } from 'react-dnd';
import { BuilderDragLayer } from './BuilderDragLayer';

interface CanvasAreaProps {
  nodes: RFNode[];
  edges: RFEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (template: string, position: { x: number; y: number }) => void;
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isAnyDragging, setIsAnyDragging] = useState(false);

  const [{ isOver }, dropRef] = useDrop<DragItem, { inserted: boolean }, { isOver: boolean }>(
    () => ({
      accept: DND_ITEM_NODE,
      drop: (item, monitor) => {
        const client = monitor.getClientOffset();
        if (!client || !flowWrapper.current) return undefined;
        const bounds = flowWrapper.current.getBoundingClientRect();
        const position = reactFlow.project({ x: client.x - bounds.left, y: client.y - bounds.top });
        // Validate payload shape
        const templateName = item?.template;
        if (!templateName) return undefined;
        addNode(templateName, position);
        return { inserted: true };
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
    <div ref={setDropRef} className="relative flex-1 min-w-0" onKeyDown={onKeyDown} tabIndex={0}>
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
      {/* Top-left overlay: Save status indicator only */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2">
        {/* Keep overlay non-interactive; indicator enables pointer events for tooltip */}
        <SaveStatusIndicator state={saveState} />
      </div>

      {/* Bottom-center floating toolbar and popover */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <Popover
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setTimeout(() => triggerRef.current?.focus(), 0);
          }}
        >
          <div
            role="toolbar"
            aria-label="Builder toolbar"
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full border bg-background/95 shadow-lg backdrop-blur px-2 py-1"
            data-testid="builder-toolbar"
          >
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant="default"
                size="sm"
                type="button"
                aria-label="Add node"
                className="h-8 w-8 rounded-full"
                data-testid="add-node-button"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </div>
          {open ? (
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              onInteractOutside={(e) => {
                // Keep popover open during active drags from its content
                if (isAnyDragging) e.preventDefault();
              }}
              className="w-[560px] max-w-[90vw] p-2"
              aria-labelledby="add-node-title"
            >
              <h2 id="add-node-title" className="sr-only">Add node</h2>
              <PopoverList
                templates={templates}
                onInsert={(tplName) => {
                  insertAtViewportCenter(tplName);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                onDropSuccess={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                setAnyDragging={setIsAnyDragging}
                onRequestClose={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              />
            </PopoverContent>
          ) : null}
        </Popover>
      </div>
      {/* Global custom drag layer for preview */}
      <BuilderDragLayer />
    </div>
  );
}

function PopoverList({
  templates,
  onInsert,
  onDropSuccess,
  setAnyDragging,
  onRequestClose,
}: {
  templates: TemplateNodeSchema[];
  onInsert: (templateName: string) => void;
  onDropSuccess: () => void;
  setAnyDragging: (dragging: boolean) => void;
  onRequestClose: () => void;
}) {
  // Roving focus management
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    // Keep refs array length in sync
    itemRefs.current = itemRefs.current.slice(0, templates.length);
  }, [templates.length]);

  // Focus first option when the list appears
  useEffect(() => {
    itemRefs.current[activeIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndex + 1) % templates.length;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndex - 1 + templates.length) % templates.length;
      setActiveIndex(prev);
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      const tpl = templates[activeIndex];
      if (tpl) onInsert(tpl.name);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRequestClose();
    }
  };

  return (
    <ScrollArea className="max-h-[60vh]">
      <div role="listbox" className="flex flex-col gap-1 p-1" onKeyDown={onKeyDown}>
        {templates.map((tpl, idx) => (
          <ForwardedPopoverListItem
            key={tpl.name}
            template={tpl}
            ref={(el) => { itemRefs.current[idx] = el; }}
            id={`tpl-opt-${idx}`}
            active={idx === activeIndex}
            onInsert={() => onInsert(tpl.name)}
            onDragStateChange={setAnyDragging}
            onDropSuccess={onDropSuccess}
            onFocus={() => setActiveIndex(idx)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface PopoverListItemProps {
  template: TemplateNodeSchema;
  active: boolean;
  onInsert: () => void;
  onDragStateChange: (dragging: boolean) => void;
  id: string;
  onDropSuccess: () => void;
  onFocus?: () => void;
}

// mergeRefs removed; inline ref composition used below

const PopoverListItem = (
  { template, active, onInsert, onDragStateChange, id, onDropSuccess, onFocus }: PopoverListItemProps,
  ref: React.Ref<HTMLButtonElement>,
) => {
  const [{ isDragging }, dragRef, dragPreview] = useDrag<DragItem, { inserted: boolean }, { isDragging: boolean }>(
    () => ({
      type: DND_ITEM_NODE,
      item: { template: template.name, title: template.title, kind: template.kind, origin: 'popover' as const },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      end: (_item, monitor) => {
        onDragStateChange(false);
        if (monitor.didDrop()) {
          const result = monitor.getDropResult<{ inserted: boolean }>();
          if (result?.inserted) onDropSuccess();
        }
      },
    }),
    [template, onDragStateChange, onDropSuccess],
  );
  // Report drag start using isDragging to avoid deprecated begin hook
  useEffect(() => {
    if (isDragging) onDragStateChange(true);
  }, [isDragging, onDragStateChange]);
  useEffect(() => {
    // Optional: hide default drag preview
    if (dragPreview) {
      try {
        dragPreview(getEmptyImage(), { captureDraggingState: true });
      } catch {
        // ignore if backend doesn't support
      }
    }
  }, [dragPreview]);

  // Lazy import to avoid top-level dependency; fallback if not available
  function getEmptyImage(): HTMLImageElement {
    // Minimal 1x1 transparent gif
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    return img;
  }

  // Compose ref with react-dnd connector; ensure void-returning callback
  const setRef = (el: HTMLButtonElement | null) => {
    if (el) {
      try {
        dragRef(el);
      } catch {
        /* ignore */
      }
    }
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref && 'current' in (ref as object)) {
      try {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Card className={`p-0 ${isDragging ? 'opacity-70' : ''}`}>
      <button
        id={id}
        ref={setRef}
        role="option"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        type="button"
        className="w-full rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring hover:bg-accent hover:text-accent-foreground"
        onClick={onInsert}
        onFocus={onFocus}
        data-testid={`template-${template.name}`}
      >
        <div className="flex items-center gap-2">
          <KindIcon kind={template.kind} />
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] leading-none ${kindBadgeClasses(template.kind)}`}>
            {kindLabel(template.kind)}
          </span>
          <span className="text-sm font-medium text-primary">{template.title || template.name}</span>
        </div>
      </button>
    </Card>
  );
};
const ForwardedPopoverListItem = forwardRef(PopoverListItem);

function KindIcon({ kind }: { kind?: TemplateNodeSchema['kind'] }) {
  const cls = 'h-4 w-4 text-muted-foreground';
  if (kind === 'agent') return <Bot className={cls} />;
  if (kind === 'tool') return <Wrench className={cls} />;
  if (kind === 'trigger') return <Zap className={cls} />;
  return <Zap className={cls} />;
}

// Hoisted RightPanelContent to keep identity stable across AgentBuilder re-renders
const RightPanelContent = memo(function RightPanelContent({
  rightTab,
  setRightTab,
  activityEligible,
  selectedDisplayTitle,
  selectedNode,
  updateNodeData,
}: {
  rightTab: 'properties' | 'activity';
  setRightTab: (tab: 'properties' | 'activity') => void;
  activityEligible: boolean;
  selectedDisplayTitle: string;
  selectedNode: RFNode | null;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="border-b flex items-center gap-2 px-4 h-10 shrink-0">
        <div className="text-xs font-semibold tracking-wide truncate" title={selectedDisplayTitle}>{selectedDisplayTitle}</div>
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
            {/* Show tracing spans for agent/tool nodes */}
            <NodeObsSidebar node={selectedNode} />
          </div>
        ) : (
          <RightPropertiesPanel node={selectedNode} onChange={updateNodeData} />
        )}
      </div>
    </div>
  );
});

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
        <div className="absolute inset-0 flex min-h-0 min-w-0 overflow-hidden">
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
          {/* Inline right panel on xl+ */}
          <aside className="hidden xl:flex h-full w-96 shrink-0 border-l bg-sidebar p-0 flex-col overflow-hidden">
            <RightPanelContent
              rightTab={rightTab}
              setRightTab={setRightTab}
              activityEligible={activityEligible}
              selectedDisplayTitle={selectedDisplayTitle}
              selectedNode={selectedNode}
              updateNodeData={updateNodeData}
            />
          </aside>

          {/* Toggle + Drawer for < xl */}
          <div className="xl:hidden pointer-events-none absolute right-2 top-2 z-20">
            <Drawer>
              <DrawerTrigger asChild>
                <Button type="button" size="sm" variant="secondary" className="pointer-events-auto" aria-label="Open properties panel">
                  Props
                </Button>
              </DrawerTrigger>
              <DrawerContent className="p-0">
                <div className="h-[85vh] w-full overflow-hidden">
                  <RightPanelContent
                    rightTab={rightTab}
                    setRightTab={setRightTab}
                    activityEligible={activityEligible}
                    selectedDisplayTitle={selectedDisplayTitle}
                    selectedNode={selectedNode}
                    updateNodeData={updateNodeData}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </ReactFlowProvider>
    </DndProvider>
  );
}
