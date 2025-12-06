import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GraphLayout, type GraphLayoutServices } from '@/components/agents/GraphLayout';
import type { GraphNodeConfig, GraphPersistedEdge, GraphSaveState } from '@/features/graph/types';

const sidebarProps: any[] = [];
const emptySidebarProps: any[] = [];
const canvasSpy = vi.hoisted(() => vi.fn());
const listAllSecretPathsMock = vi
  .hoisted(() => vi.fn<[], Promise<string[]>>().mockResolvedValue([]));

type GraphLayoutServiceMocks = {
  [K in keyof GraphLayoutServices]: vi.Mock<
    Parameters<GraphLayoutServices[K]>,
    ReturnType<GraphLayoutServices[K]>
  >;
};

let services: GraphLayoutServiceMocks;
let nodeActionMutate: vi.Mock;

const hookMocks = vi.hoisted(() => ({
  useGraphData: vi.fn(),
  useGraphSocket: vi.fn(),
  useNodeStatus: vi.fn(),
  useMcpNodeState: vi.fn(),
  useNodeAction: vi.fn(),
  useTemplates: vi.fn(),
}));

vi.mock('@/components/GraphCanvas', () => ({
  GraphCanvas: (props: unknown) => {
    canvasSpy(props);
    return <div data-testid="graph-canvas-mock" />;
  },
}));

vi.mock('@/components/NodePropertiesSidebar', () => ({
  __esModule: true,
  default: (props: unknown) => {
    sidebarProps.push(props);
    return <div data-testid="node-sidebar-mock" />;
  },
}));

vi.mock('@/components/EmptySelectionSidebar', () => ({
  __esModule: true,
  default: (props: unknown) => {
    emptySidebarProps.push(props);
    return <div data-testid="empty-sidebar-mock" />;
  },
}));

vi.mock('@/features/graph/hooks/useGraphData', () => ({
  useGraphData: hookMocks.useGraphData,
}));

vi.mock('@/features/graph/hooks/useGraphSocket', () => ({
  useGraphSocket: hookMocks.useGraphSocket,
}));

vi.mock('@/features/graph/hooks/useNodeStatus', () => ({
  useNodeStatus: hookMocks.useNodeStatus,
}));

vi.mock('@/lib/graph/hooks', () => ({
  useMcpNodeState: hookMocks.useMcpNodeState,
  useTemplates: hookMocks.useTemplates,
}));

vi.mock('@/features/graph/hooks/useNodeAction', () => ({
  useNodeAction: hookMocks.useNodeAction,
}));

vi.mock('@/features/secrets/utils/flatVault', () => ({
  listAllSecretPaths: listAllSecretPathsMock,
}));

const createServiceMocks = vi.hoisted((): (() => GraphLayoutServiceMocks) => () => {
  const searchNixPackages = vi
    .fn<Parameters<GraphLayoutServices['searchNixPackages']>, ReturnType<GraphLayoutServices['searchNixPackages']>>()
    .mockResolvedValue([]);
  const listNixPackageVersions = vi
    .fn<Parameters<GraphLayoutServices['listNixPackageVersions']>, ReturnType<GraphLayoutServices['listNixPackageVersions']>>()
    .mockResolvedValue([]);
  const resolveNixSelection = vi
    .fn<Parameters<GraphLayoutServices['resolveNixSelection']>, ReturnType<GraphLayoutServices['resolveNixSelection']>>()
    .mockResolvedValue({ version: 'latest', commit: 'abc123', attr: 'pkg' });
  const listVariableKeys = vi
    .fn<Parameters<GraphLayoutServices['listVariableKeys']>, ReturnType<GraphLayoutServices['listVariableKeys']>>()
    .mockResolvedValue([]);

  return {
    searchNixPackages,
    listNixPackageVersions,
    resolveNixSelection,
    listVariableKeys,
  } satisfies GraphLayoutServiceMocks;
});

type GraphDataMock = {
  nodes: GraphNodeConfig[];
  edges: GraphPersistedEdge[];
  loading: boolean;
  savingState: GraphSaveState;
  savingErrorMessage: string | null;
  updateNode: vi.Mock;
  applyNodeStatus: vi.Mock;
  applyNodeState: vi.Mock;
  setEdges: vi.Mock;
  removeNodes: vi.Mock;
  addNode: vi.Mock;
  scheduleSave: vi.Mock;
  refresh: vi.Mock;
};

function mockGraphData(overrides: Partial<GraphDataMock> = {}): GraphDataMock {
  const base: GraphDataMock = {
    nodes: [],
    edges: [],
    loading: false,
    savingState: { status: 'saved', error: null },
    savingErrorMessage: null,
    updateNode: vi.fn(),
    applyNodeStatus: vi.fn(),
    applyNodeState: vi.fn(),
    setEdges: vi.fn(),
    removeNodes: vi.fn(),
    addNode: vi.fn(),
    scheduleSave: vi.fn(),
    refresh: vi.fn(),
  } satisfies GraphDataMock;
  const value: GraphDataMock = { ...base, ...overrides };
  hookMocks.useGraphData.mockReturnValue(value);
  return value;
}

describe('GraphLayout', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    emptySidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    hookMocks.useMcpNodeState.mockReturnValue({
      tools: [],
      enabledTools: [],
      setEnabledTools: vi.fn(),
      isLoading: false,
    });
    hookMocks.useTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    nodeActionMutate = vi.fn().mockResolvedValue(undefined);
    hookMocks.useNodeAction.mockReturnValue({ mutateAsync: nodeActionMutate, isPending: false });
    canvasSpy.mockReset();
    listAllSecretPathsMock.mockReset();
    listAllSecretPathsMock.mockResolvedValue([]);
    services = createServiceMocks();
  });

  it('renders agent fallback title when persisted title is empty', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'agent-1',
          template: 'agent-template',
          kind: 'Agent',
          title: '   ',
          x: 10,
          y: 20,
          status: 'not_ready',
          config: { title: '', name: '  Delta  ', role: '  Navigator  ' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as { nodes?: Array<{ data?: { title?: string; kind?: string } }> };

    expect(props?.nodes?.[0]?.data?.kind).toBe('Agent');
    expect(props?.nodes?.[0]?.data?.title).toBe('Delta (Navigator)');
  });

  it('respects literal config title even when matching template', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: 'Agent',
          x: 0,
          y: 0,
          status: 'ready',
          config: { title: 'Agent', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };

    expect(latest?.nodes?.[0]?.data?.title).toBe('Agent');
  });

  it('derives agent title from name when role missing', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: '',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: 'Echo', role: '   ' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };

    expect(latest?.nodes?.[0]?.data?.title).toBe('Echo');
  });

  it('falls back to template when title and profile are empty', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Support Agent',
          kind: 'Agent',
          title: '   ',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: '  ', role: '' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };

    expect(latest?.nodes?.[0]?.data?.title).toBe('Agent');
  });

  it('passes sidebar config/state and persists config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node', systemPrompt: 'You are helpful.' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockImplementation(({ onStatus, onState }) => {
      onStatus?.({
        nodeId: 'node-1',
        updatedAt: new Date().toISOString(),
        provisionStatus: { state: 'ready' },
        isPaused: false,
      } as any);
      onState?.({ nodeId: 'node-1', state: { foo: 'bar' } } as any);
    });

    const refetchStatus = vi.fn();
    hookMocks.useNodeStatus.mockReturnValue({
      data: { provisionStatus: { state: 'ready' } },
      refetch: refetchStatus,
    });

    const { unmount } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    expect(canvasProps).toBeDefined();
    expect(canvasProps).toHaveProperty('edgeTypes');
    expect((canvasProps as any).edgeTypes).toHaveProperty('gradient');

    expect(sidebarProps.length).toBe(0);

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));

    expect(hookMocks.useGraphSocket).toHaveBeenCalledWith(
      expect.objectContaining({ nodeIds: ['node-1'] }),
    );

    expect(hookMocks.useNodeAction).toHaveBeenCalled();
    expect(hookMocks.useNodeAction.mock.calls.at(-1)?.[0]).toBe('node-1');

    const sidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      state: Record<string, unknown>;
      onConfigChange?: (next: Record<string, unknown>) => void;
      nixPackageSearch: (...args: unknown[]) => Promise<unknown>;
      fetchNixPackageVersions: (...args: unknown[]) => Promise<unknown>;
      resolveNixPackageSelection: (...args: unknown[]) => Promise<unknown>;
      secretKeys: string[];
      variableKeys: string[];
      ensureSecretKeys?: () => Promise<string[]>;
      ensureVariableKeys?: () => Promise<string[]>;
      tools?: unknown[];
      enabledTools?: unknown[];
      onToggleTool?: (name: string, enabled: boolean) => void;
      toolsLoading?: boolean;
      onProvision?: () => void;
      onDeprovision?: () => void;
      canProvision?: boolean;
      canDeprovision?: boolean;
      isActionPending?: boolean;
    };

    expect(typeof sidebar.nixPackageSearch).toBe('function');
    expect(typeof sidebar.fetchNixPackageVersions).toBe('function');
    expect(typeof sidebar.resolveNixPackageSelection).toBe('function');
    expect(Array.isArray(sidebar.secretKeys)).toBe(true);
    expect(Array.isArray(sidebar.variableKeys)).toBe(true);
    expect(typeof sidebar.ensureSecretKeys).toBe('function');
    expect(typeof sidebar.ensureVariableKeys).toBe('function');
    expect(Array.isArray(sidebar.tools)).toBe(true);
    expect(Array.isArray(sidebar.enabledTools)).toBe(true);
    expect(typeof sidebar.onToggleTool).toBe('function');
    expect(typeof sidebar.toolsLoading).toBe('boolean');
    expect(typeof sidebar.onProvision).toBe('function');
    expect(typeof sidebar.onDeprovision).toBe('function');
    expect(typeof sidebar.canProvision).toBe('boolean');
    expect(typeof sidebar.canDeprovision).toBe('boolean');
    expect(typeof sidebar.isActionPending).toBe('boolean');

    expect(sidebar.config).toEqual(
      expect.objectContaining({
        kind: 'Agent',
        title: 'Agent Node',
        systemPrompt: 'You are helpful.',
        template: 'agent-template',
      }),
    );
    expect(sidebar).toHaveProperty('displayTitle', 'Agent Node');

    expect(sidebar.state).toEqual({ status: 'ready' });
    expect(sidebar.canProvision).toBe(false);
    expect(sidebar.canDeprovision).toBe(true);
    expect(sidebar.isActionPending).toBe(false);

    sidebar.onConfigChange?.({ title: 'Updated Agent', systemPrompt: 'New prompt' });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    const lastCall = updateNode.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('node-1');
    expect(lastCall?.[1]).toEqual({
      config: { systemPrompt: 'New prompt' },
      title: 'Updated Agent',
    });

    act(() => {
      sidebar.onProvision?.();
    });

    await waitFor(() => expect(nodeActionMutate).toHaveBeenCalledWith('provision'));
    await waitFor(() => expect(refetchStatus).toHaveBeenCalled());

    unmount();
  });

  it('restores agent profile fallback when title cleared in sidebar', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    const graph = mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: 'Agent',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    const { rerender } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));

    const sidebar = sidebarProps.at(-1) as {
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    act(() => {
      sidebar.onConfigChange?.({ title: '   ' });
    });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    const payload = updateNode.mock.calls.at(-1)?.[1] as { config: Record<string, unknown>; title?: string };
    expect(payload).toBeDefined();
    expect(payload?.config).toEqual({ name: 'Atlas', role: 'Navigator' });
    expect(payload?.title).toBe('');
    const sidebarCountBeforeRefresh = sidebarProps.length;
    graph.nodes = graph.nodes.map((node) =>
      node.id === 'node-1'
        ? {
            ...node,
            title: '',
            config: { ...(node.config ?? {}), title: '', name: 'Atlas', role: 'Navigator' },
          }
        : node,
    );
    hookMocks.useGraphData.mockReturnValue(graph);
    canvasSpy.mockClear();
    rerender(<GraphLayout services={services} />);

    await waitFor(() => {
      const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
        nodes?: Array<{ data?: { title?: string } }>;
      };
      expect(latest?.nodes?.[0]?.data?.title).toBe('Atlas (Navigator)');
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(sidebarCountBeforeRefresh));
    const refreshedSidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      displayTitle?: string;
    };
    expect(refreshedSidebar.config).toEqual(expect.objectContaining({ title: '' }));
    expect(refreshedSidebar.displayTitle).toBe('');
  });

  it('persists agent title edits and restores the saved value after refresh', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    const graph = mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: '',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    const { rerender } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1) as {
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    act(() => {
      sidebar.onConfigChange?.({ title: 'Mission Control' });
    });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    const payload = updateNode.mock.calls.at(-1)?.[1] as {
      config: Record<string, unknown>;
      title?: string;
    };
    expect(payload).toEqual({ config: { name: 'Atlas', role: 'Navigator' }, title: 'Mission Control' });

    graph.nodes = graph.nodes.map((node) =>
      node.id === 'node-1'
        ? {
            ...node,
            title: 'Mission Control',
            config: { ...(node.config ?? {}), title: 'Mission Control' },
          }
        : node,
    );

    hookMocks.useGraphData.mockReturnValue(graph);
    const sidebarCountBeforeRefresh = sidebarProps.length;
    canvasSpy.mockClear();
    rerender(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };
    expect(latest?.nodes?.[0]?.data?.title).toBe('Mission Control');

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(sidebarCountBeforeRefresh));
    const refreshedSidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      displayTitle?: string;
    };
    expect(refreshedSidebar.config).toEqual(
      expect.objectContaining({ title: 'Mission Control', name: 'Atlas', role: 'Navigator' }),
    );
    expect(refreshedSidebar.displayTitle).toBe('Mission Control');
  });

  it('retains agent title when only profile fields change', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    const graph = mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: 'Mission Control',
          x: 0,
          y: 0,
          status: 'ready',
          config: { title: 'Mission Control', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    const { rerender } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1) as {
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    act(() => {
      sidebar.onConfigChange?.({ name: 'Voyager', role: 'Pathfinder' });
    });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    const payload = updateNode.mock.calls.at(-1)?.[1] as {
      config: Record<string, unknown>;
      title?: string;
    };
    expect(payload).toEqual({ config: { name: 'Voyager', role: 'Pathfinder' } });

    const sidebarCountBeforeRefresh = sidebarProps.length;
    graph.nodes = graph.nodes.map((node) =>
      node.id === 'node-1'
        ? {
            ...node,
            config: {
              ...(node.config ?? {}),
              name: 'Voyager',
              role: 'Pathfinder',
              title: 'Mission Control',
            },
            title: 'Mission Control',
          }
        : node,
    );

    hookMocks.useGraphData.mockReturnValue(graph);
    canvasSpy.mockClear();
    rerender(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };
    expect(latest?.nodes?.[0]?.data?.title).toBe('Mission Control');

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(sidebarCountBeforeRefresh));
    const refreshedSidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      displayTitle?: string;
    };
    expect(refreshedSidebar.config).toEqual(
      expect.objectContaining({ title: 'Mission Control', name: 'Voyager', role: 'Pathfinder' }),
    );
    expect(refreshedSidebar.displayTitle).toBe('Mission Control');
  });

  it('keeps agent title empty and updates placeholder fallback when profile fields change', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    const graph = mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: '',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    const { rerender } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1) as {
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    act(() => {
      sidebar.onConfigChange?.({ name: 'Orion', role: 'Pathfinder' });
    });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());
    const payload = updateNode.mock.calls.at(-1)?.[1] as {
      config: Record<string, unknown>;
      title?: string;
    };
    expect(payload).toEqual({ config: { name: 'Orion', role: 'Pathfinder' } });

    const sidebarCountBeforeRefresh = sidebarProps.length;
    graph.nodes = graph.nodes.map((node) =>
      node.id === 'node-1'
        ? {
            ...node,
            config: {
              ...(node.config ?? {}),
              name: 'Orion',
              role: 'Pathfinder',
              title: '',
            },
            title: '',
          }
        : node,
    );

    hookMocks.useGraphData.mockReturnValue(graph);
    canvasSpy.mockClear();
    rerender(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };
    expect(latest?.nodes?.[0]?.data?.title).toBe('Orion (Pathfinder)');

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(sidebarCountBeforeRefresh));
    const refreshedSidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      displayTitle?: string;
    };
    expect(refreshedSidebar.config).toEqual(
      expect.objectContaining({ title: '', name: 'Orion', role: 'Pathfinder' }),
    );
    expect(refreshedSidebar.displayTitle).toBe('');
  });

  it('keeps stored agent title when distinct from template', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'Agent',
          kind: 'Agent',
          title: 'Custom Dispatch',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: '', role: '' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());

    const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
      nodes?: Array<{ data?: { title?: string } }>;
    };

    expect(latest?.nodes?.[0]?.data?.title).toBe('Custom Dispatch');
  });

  it('renders backend templates in the empty sidebar', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [],
      edges: [],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });
    hookMocks.useTemplates.mockReturnValue({
      data: [
        { name: 'trigger-http', kind: 'trigger', title: 'HTTP Trigger', description: 'Start flows' },
        { name: 'agent-ops', kind: 'agent', title: 'Ops Agent', description: 'Handle ops tasks' },
      ],
      isLoading: false,
      isError: false,
    });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(emptySidebarProps.length).toBeGreaterThan(0));
    const emptySidebar = emptySidebarProps.at(-1) as {
      nodeItems?: Array<Record<string, unknown>>;
      statusMessage?: string;
    };

    expect(emptySidebar.nodeItems).toEqual([
      expect.objectContaining({ id: 'trigger-http', kind: 'Trigger', title: 'HTTP Trigger' }),
      expect.objectContaining({ id: 'agent-ops', kind: 'Agent', title: 'Ops Agent' }),
    ]);
    expect(emptySidebar.statusMessage).toBeUndefined();
  });

  it('provides a sidebar status message when templates fail to load', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [],
      edges: [],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });
    hookMocks.useTemplates.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(emptySidebarProps.length).toBeGreaterThan(0));
    const emptySidebar = emptySidebarProps.at(-1) as { statusMessage?: string };

    expect(emptySidebar.statusMessage).toBe('Failed to load templates.');
  });

  it('shows a loading status message while templates are fetching', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [],
      edges: [],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });
    hookMocks.useTemplates.mockReturnValue({ data: [], isLoading: true, isError: false });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(emptySidebarProps.length).toBeGreaterThan(0));
    const emptySidebar = emptySidebarProps.at(-1) as { statusMessage?: string };

    expect(emptySidebar.statusMessage).toBe('Loading templates...');
  });

  it('adds a graph node when dropping a template onto the canvas', async () => {
    const addNode = vi.fn();
    const scheduleSave = vi.fn();

    mockGraphData({
      nodes: [],
      edges: [],
      addNode,
      scheduleSave,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });
    hookMocks.useTemplates.mockReturnValue({
      data: [
        {
          name: 'agent-template',
          title: 'Agent Template',
          kind: 'agent',
          sourcePorts: { out: { title: 'Main Out' } },
          targetPorts: { in: { title: 'Main In' } },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onDrop?: (
        event: React.DragEvent<HTMLDivElement>,
        context: { data: Record<string, string>; position: { x: number; y: number } },
      ) => void;
    };

    expect(typeof canvasProps.onDrop).toBe('function');

    act(() => {
      canvasProps.onDrop?.(
        { preventDefault() {} } as React.DragEvent<HTMLDivElement>,
        {
          data: { id: 'agent-template', kind: 'Agent', title: '  New Agent  ' },
          position: { x: 300, y: 420 },
        },
      );
    });

    expect(addNode).toHaveBeenCalledTimes(1);
    const [node, metadata] = addNode.mock.calls[0] as [
      GraphNodeConfig,
      { template: string; config?: Record<string, unknown>; position?: { x: number; y: number } },
    ];

    expect(typeof node.id).toBe('string');
    expect(node.id.length).toBeGreaterThan(0);
    expect(node.template).toBe('agent-template');
    expect(node.kind).toBe('Agent');
    expect(node.title).toBe('New Agent');
    expect(node.x).toBe(300);
    expect(node.y).toBe(420);
    expect(node.config).toEqual({ title: 'New Agent' });
    expect(node.ports.inputs).toEqual([{ id: 'in', title: 'Main In' }]);
    expect(node.ports.outputs).toEqual([{ id: 'out', title: 'Main Out' }]);
    expect(metadata.template).toBe('agent-template');
    expect(metadata.config).toEqual({ title: 'New Agent' });
    expect(metadata.position).toEqual({ x: 300, y: 420 });

    expect(scheduleSave).toHaveBeenCalledTimes(1);
  });

  it('persists node position updates when drag ends', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    expect(props.onNodesChange).toBeDefined();

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 120, y: 240 },
          dragging: true,
        },
      ]);
    });

    expect(updateNode).not.toHaveBeenCalled();

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'position',
          position: { x: 150, y: 260 },
          dragging: false,
        },
      ]);
    });

    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith('node-1', expect.objectContaining({ x: 150, y: 260 })),
    );
  });

  it('persists node deletions through useGraphData.removeNodes', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'remove',
        },
      ]);
    });

    await waitFor(() => expect(removeNodes).toHaveBeenCalledWith(['node-1']));
  });

  it('uses onNodesDelete to persist removals once when both callbacks fire', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: Array<{ id: string; type: string }>) => void;
      onNodesDelete?: (nodes: Array<{ id: string }>) => void;
    };

    expect(typeof props.onNodesDelete).toBe('function');

    act(() => {
      props.onNodesChange?.([
        {
          id: 'node-1',
          type: 'remove',
        },
      ]);
      props.onNodesDelete?.([
        {
          id: 'node-1',
        },
      ]);
    });

    await waitFor(() => expect(removeNodes).toHaveBeenCalledWith(['node-1']));
    expect(removeNodes).toHaveBeenCalledTimes(1);
  });

  it('persists edges when connecting and removing', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
        {
          id: 'node-2',
          template: 'tool-template',
          kind: 'Tool',
          title: 'Tool Node',
          x: 200,
          y: 200,
          status: 'not_ready',
          config: { title: 'Tool Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const props = canvasSpy.mock.calls.at(-1)?.[0] as {
      onConnect?: (connection: any) => void;
      onEdgesChange?: (changes: any[]) => void;
    };

    act(() => {
      props.onConnect?.({
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'out',
        targetHandle: 'in',
      });
    });

    await waitFor(() =>
      expect(setEdges).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'node-1-out__node-2-in',
          source: 'node-1',
          target: 'node-2',
          sourceHandle: 'out',
          targetHandle: 'in',
        }),
      ]),
    );

    act(() => {
      props.onEdgesChange?.([
        {
          id: 'node-1-out__node-2-in',
          type: 'remove',
        },
      ]);
    });

    await waitFor(() => expect(setEdges).toHaveBeenCalledWith([]));
  });

  it('wires MCP tools state into the sidebar and toggles enabled tools', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();
    const setEnabledTools = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'mcp-1',
          template: 'mcp-template',
          kind: 'MCP',
          title: 'MCP Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'MCP Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });
    hookMocks.useMcpNodeState.mockReturnValue({
      tools: [
        { name: 'search', title: 'Search' },
        { name: 'summarize', title: 'Summarize' },
      ],
      enabledTools: ['search'],
      setEnabledTools,
      isLoading: false,
    });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'mcp-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));

    const sidebar = sidebarProps.at(-1) as {
      tools?: unknown;
      enabledTools?: unknown;
      toolsLoading?: boolean;
      onToggleTool?: (name: string, enabled: boolean) => void;
    };

    expect(sidebar.tools).toEqual([
      { name: 'search', title: 'Search' },
      { name: 'summarize', title: 'Summarize' },
    ]);
    expect(sidebar.enabledTools).toEqual(['search']);
    expect(sidebar.toolsLoading).toBe(false);

    sidebar.onToggleTool?.('summarize', true);
    sidebar.onToggleTool?.('search', false);

    expect(setEnabledTools).toHaveBeenNthCalledWith(1, ['search', 'summarize']);
    expect(setEnabledTools).toHaveBeenNthCalledWith(2, []);
  });

  it('preserves selection when switching between nodes in any event order', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'agent-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
        {
          id: 'tool-1',
          template: 'tool-template',
          kind: 'Tool',
          title: 'Tool Node',
          x: 200,
          y: 200,
          status: 'not_ready',
          config: { title: 'Tool Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        { id: 'agent-1', type: 'select', selected: true },
      ]);
    });

    await waitFor(() =>
      expect(sidebarProps.at(-1)).toMatchObject({
        config: expect.objectContaining({ title: 'Agent Node', kind: 'Agent' }),
      }),
    );

    act(() => {
      canvasProps.onNodesChange?.([
        { id: 'agent-1', type: 'select', selected: false },
        { id: 'tool-1', type: 'select', selected: true },
      ]);
    });

    await waitFor(() =>
      expect(sidebarProps.at(-1)).toMatchObject({
        config: expect.objectContaining({ title: 'Tool Node', kind: 'Tool' }),
      }),
    );

    act(() => {
      canvasProps.onNodesChange?.([
        { id: 'agent-1', type: 'select', selected: true },
        { id: 'tool-1', type: 'select', selected: false },
      ]);
    });

    await waitFor(() =>
      expect(sidebarProps.at(-1)).toMatchObject({
        config: expect.objectContaining({ title: 'Agent Node', kind: 'Agent' }),
      }),
    );
  });

  it('wires sidebar providers through graph services', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();
    const removeNodes = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
      removeNodes,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    services.searchNixPackages.mockResolvedValue([{ name: 'nodejs' }]);
    services.listNixPackageVersions.mockResolvedValue([{ version: '18.16.0' }]);
    services.resolveNixSelection.mockResolvedValue({ version: '18.16.0', commit: 'abc123', attr: 'pkgs.nodejs' });
    listAllSecretPathsMock.mockResolvedValue(['secret/github/token-app', 'kv/prod/db']);
    services.listVariableKeys.mockResolvedValue(['API_TOKEN', 'DB_URL']);

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1) as {
      nixPackageSearch: (...args: unknown[]) => Promise<unknown>;
      fetchNixPackageVersions: (...args: unknown[]) => Promise<unknown>;
      resolveNixPackageSelection: (...args: unknown[]) => Promise<unknown>;
      secretKeys: string[];
      variableKeys: string[];
      ensureSecretKeys?: () => Promise<string[]>;
      ensureVariableKeys?: () => Promise<string[]>;
    };

    await expect(sidebar.nixPackageSearch('node')).resolves.toEqual([
      { value: 'nodejs', label: 'nodejs' },
    ]);
    expect(services.searchNixPackages).toHaveBeenCalledWith('node');

    await expect(sidebar.fetchNixPackageVersions('nodejs')).resolves.toEqual(['18.16.0']);
    expect(services.listNixPackageVersions).toHaveBeenCalledWith('nodejs');

    await expect(sidebar.resolveNixPackageSelection('nodejs', '18.16.0')).resolves.toEqual({
      version: '18.16.0',
      commitHash: 'abc123',
      attributePath: 'pkgs.nodejs',
    });
    expect(services.resolveNixSelection).toHaveBeenCalledWith('nodejs', '18.16.0');

    expect(sidebar.secretKeys).toEqual([]);
    expect(sidebar.variableKeys).toEqual([]);

    await expect(sidebar.ensureSecretKeys?.()).resolves.toEqual(['secret/github/token-app', 'kv/prod/db']);
    expect(listAllSecretPathsMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const latest = sidebarProps.at(-1) as { secretKeys: string[] };
      expect(latest.secretKeys).toEqual(['secret/github/token-app', 'kv/prod/db']);
    });

    const afterSecret = sidebarProps.at(-1) as {
      secretKeys: string[];
      ensureSecretKeys?: () => Promise<string[]>;
      ensureVariableKeys?: () => Promise<string[]>;
    };

    await expect(afterSecret.ensureSecretKeys?.()).resolves.toEqual(['secret/github/token-app', 'kv/prod/db']);
    expect(listAllSecretPathsMock).toHaveBeenCalledTimes(1);

    await expect(afterSecret.ensureVariableKeys?.()).resolves.toEqual(['API_TOKEN', 'DB_URL']);
    expect(services.listVariableKeys).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const latest = sidebarProps.at(-1) as { variableKeys: string[] };
      expect(latest.variableKeys).toEqual(['API_TOKEN', 'DB_URL']);
    });

    services.searchNixPackages.mockRejectedValueOnce(new Error('boom'));
    await expect(sidebar.nixPackageSearch('whatever')).resolves.toEqual([]);
  });

  it('clears sidebar selection when the node disappears', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    const graphState = {
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [] as any[],
      loading: false,
      savingState: { status: 'saved', error: null } as const,
      savingErrorMessage: null as string | null,
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    };

    hookMocks.useGraphData.mockImplementation(() => graphState);
    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    const { rerender } = render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'node-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(screen.getByTestId('node-sidebar-mock')).toBeInTheDocument());

    act(() => {
      graphState.nodes = [];
      rerender(<GraphLayout services={services} />);
    });

    await waitFor(() => expect(screen.getByTestId('empty-sidebar-mock')).toBeInTheDocument());
    expect(screen.queryByTestId('node-sidebar-mock')).not.toBeInTheDocument();
  });

  it('omits UI-only keys when persisting agent config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'agent-2',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: {
            systemPrompt: 'Original prompt',
            role: 'Navigator',
            kind: 'Agent',
            template: 'agent-template',
          },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: Array<{ id: string; type: string; selected: boolean }>) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'agent-2',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(screen.getByTestId('node-sidebar-mock')).toBeInTheDocument());

    const sidebar = sidebarProps.at(-1) as {
      onConfigChange?: (cfg: Partial<Record<string, unknown>>) => void;
    };

    act(() => {
      sidebar.onConfigChange?.({
        kind: 'Agent',
        template: 'agent-template',
        title: '  Updated Agent  ',
        systemPrompt: 'Updated prompt',
        debounceMs: 325,
      });
    });

    await waitFor(() => expect(updateNode).toHaveBeenCalled());

    const lastCall = updateNode.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('agent-2');
    const payload = lastCall?.[1] as { config: Record<string, unknown>; title?: string };
    expect(payload.title).toBe('Updated Agent');
    expect(payload.config).toMatchObject({
      systemPrompt: 'Updated prompt',
      debounceMs: 325,
      role: 'Navigator',
    });
    expect(payload.config).not.toHaveProperty('kind');
    expect(payload.config).not.toHaveProperty('title');
    expect(payload.config).not.toHaveProperty('template');
  });
});
