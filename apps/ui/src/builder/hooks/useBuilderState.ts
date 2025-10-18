import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import { v4 as uuid } from 'uuid';
import { getApiBase } from '../../lib/apiClient';
import type { TemplateNodeSchema, PersistedGraph } from 'shared';

interface BuilderNodeData {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;
  state?: Record<string, unknown>;
}
export type BuilderNode = Node<BuilderNodeData>;

interface UseBuilderStateResult {
  nodes: BuilderNode[];
  edges: Edge[];
  templates: TemplateNodeSchema[];
  selectedNode: BuilderNode | null;
  loading: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (template: string, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<BuilderNodeData>) => void;
  deleteSelected: () => void;
}

type BuilderOptions = { debounceMs?: number };

export function useBuilderState(
  serverBase = getApiBase(),
  options?: BuilderOptions,
): UseBuilderStateResult {
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [templates, setTemplates] = useState<TemplateNodeSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<UseBuilderStateResult['saveState']>('idle');
  const versionRef = useRef<number>(0);
  const debounceRef = useRef<number | null>(null);
  // Hydration and dirty gating: prevent autosave on initial load and only save on user edits
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load templates + saved graph
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tplRes, graphRes] = await Promise.all([
          fetch(`${serverBase}/api/templates`).then((r) => r.json()),
          fetch(`${serverBase}/api/graph`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTemplates(tplRes as TemplateNodeSchema[]);
        const graph = graphRes as PersistedGraph;
        versionRef.current = graph.version || 0;
        const rfNodes: BuilderNode[] = graph.nodes.map((n: PersistedGraph['nodes'][number]) => ({
          id: n.id,
          type: n.template, // reactflow node type equals template name for now
          position: n.position || { x: Math.random() * 400, y: Math.random() * 300 },
          data: { template: n.template, name: n.template, config: n.config, dynamicConfig: n.dynamicConfig, state: n.state },
          dragHandle: '.drag-handle',
        }));
        const rfEdges: Edge[] = graph.edges.map((e: PersistedGraph['edges'][number]) => ({
          id: `${e.source}-${e.sourceHandle}__${e.target}-${e.targetHandle}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        }));
        setNodes(rfNodes);
        setEdges(rfEdges);
      } catch (e) {
        console.error('Failed to load builder data', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Mark hydrated after initial graph load completes
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverBase]);

  const selectedNode = useMemo(() => nodes.find((n) => n.selected) ?? null, [nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    // Only mark dirty for graph-affecting changes (ignore selection, dimensions)
    if (
      changes.some((c) => c.type === 'add' || c.type === 'remove' || c.type === 'position')
    ) {
      setDirty(true);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    if (changes.some((c) => c.type === 'add' || c.type === 'remove')) {
      setDirty(true);
    }
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle)
        return false;
      if (connection.source === connection.target) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      const sourceTpl = templates.find((t) => t.name === sourceNode.type);
      const targetTpl = templates.find((t) => t.name === targetNode.type);
      if (!sourceTpl || !targetTpl) return false;
      return (
        sourceTpl.sourcePorts.includes(connection.sourceHandle) &&
        targetTpl.targetPorts.includes(connection.targetHandle)
      );
    },
    [nodes, templates],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!isValidConnection(connection)) return;
      setEdges((eds) => {
        const edgeId = `${connection.source}-${connection.sourceHandle}__${connection.target}-${connection.targetHandle}`;
        if (eds.some((e) => e.id === edgeId)) return eds; // prevent duplicates
        return addEdge({ ...connection, id: edgeId }, eds);
      });
      setDirty(true);
    },
    [isValidConnection],
  );

  const addNode = useCallback((template: string, position: { x: number; y: number }) => {
    const id = uuid();
    const node: BuilderNode = {
      id,
      type: template,
      position,
      data: { template, name: template, config: {} },
      dragHandle: '.drag-handle',
    };
    setNodes((nds) => [...nds, node]);
    setDirty(true);
  }, []);

  const updateNodeData = useCallback((id: string, data: Partial<BuilderNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
    setDirty(true);
  }, []);

  const deleteSelected = useCallback(() => {
    setEdges((eds) => eds.filter((e) => !nodes.some((n) => n.selected && (n.id === e.source || n.id === e.target))));
    setNodes((nds) => nds.filter((n) => !n.selected));
    setDirty(true);
  }, [nodes]);

  // Autosave (debounced)
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const delay = options?.debounceMs ?? 1000;
    debounceRef.current = window.setTimeout(async () => {
      try {
        setSaveState('saving');
          const payload = {
            name: 'main',
            version: versionRef.current,
            nodes: nodes.map((n) => ({
              id: n.id,
              template: n.type,
              config: n.data.config,
              dynamicConfig: n.data.dynamicConfig,
              state: n.data.state,
              position: n.position,
            })),
            edges: edges.map((e) => ({
              source: e.source,
              sourceHandle: e.sourceHandle!,
              target: e.target,
              targetHandle: e.targetHandle!,
            })),
          };
        const res = await fetch(`${serverBase}/api/graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          setSaveState('conflict');
          await res.json();
          return;
        }
        if (!res.ok) throw new Error('Save failed');
        const saved: PersistedGraph = await res.json();
        versionRef.current = saved.version;
        setDirty(false); // reset dirty after successful save
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch (e) {
        console.error(e);
        setSaveState('error');
      }
    }, delay);
  }, [nodes, edges, serverBase, options?.debounceMs]);

  useEffect(() => {
    // Only autosave after initial hydration and when dirty
    if (hydrated && dirty) scheduleSave();
  }, [nodes, edges, scheduleSave, hydrated, dirty]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    nodes,
    edges,
    templates,
    selectedNode,
    loading,
    saveState,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeData,
    deleteSelected,
  };
}
