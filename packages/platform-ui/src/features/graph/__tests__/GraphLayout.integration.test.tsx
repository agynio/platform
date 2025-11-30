import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GraphLayout, type GraphLayoutServices } from '@/components/agents/GraphLayout';

const sidebarProps: any[] = [];
const canvasSpy = vi.hoisted(() => vi.fn());

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
}));

vi.mock('@/features/graph/hooks/useNodeAction', () => ({
  useNodeAction: hookMocks.useNodeAction,
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
  const listVaultMounts = vi
    .fn<Parameters<GraphLayoutServices['listVaultMounts']>, ReturnType<GraphLayoutServices['listVaultMounts']>>()
    .mockResolvedValue([]);
  const listVaultPaths = vi
    .fn<Parameters<GraphLayoutServices['listVaultPaths']>, ReturnType<GraphLayoutServices['listVaultPaths']>>()
    .mockResolvedValue([]);
  const listVaultKeys = vi
    .fn<Parameters<GraphLayoutServices['listVaultKeys']>, ReturnType<GraphLayoutServices['listVaultKeys']>>()
    .mockResolvedValue([]);
  const listVariableKeys = vi
    .fn<Parameters<GraphLayoutServices['listVariableKeys']>, ReturnType<GraphLayoutServices['listVariableKeys']>>()
    .mockResolvedValue([]);

  return {
    searchNixPackages,
    listNixPackageVersions,
    resolveNixSelection,
    listVaultMounts,
    listVaultPaths,
    listVaultKeys,
    listVariableKeys,
  } satisfies GraphLayoutServiceMocks;
});

describe('GraphLayout', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    hookMocks.useMcpNodeState.mockReturnValue({
      tools: [],
      enabledTools: [],
      setEnabledTools: vi.fn(),
      isLoading: false,
    });
    nodeActionMutate = vi.fn().mockResolvedValue(undefined);
    hookMocks.useNodeAction.mockReturnValue({ mutateAsync: nodeActionMutate, isPending: false });
    canvasSpy.mockReset();
    services = createServiceMocks();
  });

  it('renders agent fallback title when persisted title is empty', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
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
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
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

  it('passes sidebar config/state and persists config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

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
          config: { title: 'Agent Node', systemPrompt: 'You are helpful.' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus,
      applyNodeState,
      setEdges,
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
      secretSuggestionProvider: (...args: unknown[]) => Promise<unknown>;
      variableSuggestionProvider: (...args: unknown[]) => Promise<unknown>;
      providerDebounceMs: number;
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
    expect(typeof sidebar.secretSuggestionProvider).toBe('function');
    expect(typeof sidebar.variableSuggestionProvider).toBe('function');
    expect(Array.isArray(sidebar.tools)).toBe(true);
    expect(Array.isArray(sidebar.enabledTools)).toBe(true);
    expect(typeof sidebar.onToggleTool).toBe('function');
    expect(typeof sidebar.toolsLoading).toBe('boolean');
    expect(sidebar.providerDebounceMs).toBeGreaterThanOrEqual(200);
    expect(sidebar.providerDebounceMs).toBeLessThanOrEqual(350);
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

  it('keeps agent title placeholder when cleared in sidebar', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: '', name: 'Atlas', role: 'Navigator' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
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

    await waitFor(() => {
      const latest = canvasSpy.mock.calls.at(-1)?.[0] as {
        nodes?: Array<{ data?: { title?: string } }>;
      };
      expect(latest?.nodes?.[0]?.data?.title).toBe('Atlas (Navigator)');
    });
  });

  it('persists node position updates when drag ends', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();

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

  it('persists edges when connecting and removing', async () => {
    const updateNode = vi.fn();
    const setEdges = vi.fn();

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
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
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
    const setEnabledTools = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
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
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus: vi.fn(),
      applyNodeState: vi.fn(),
      setEdges,
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

    hookMocks.useGraphData.mockReturnValue({
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
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
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
      applyNodeStatus,
      applyNodeState,
      setEdges,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    services.searchNixPackages.mockResolvedValue([{ name: 'nodejs' }]);
    services.listNixPackageVersions.mockResolvedValue([{ version: '18.16.0' }]);
    services.resolveNixSelection.mockResolvedValue({ version: '18.16.0', commit: 'abc123', attr: 'pkgs.nodejs' });
    services.listVaultMounts.mockResolvedValue(['secret', 'kv']);
    services.listVaultPaths.mockImplementation(async (mount: string, prefix = '') => {
      if (mount !== 'secret') return [];
      const normalized = prefix.replace(/\/+$/, '');
      if (!normalized) {
        return ['github/'];
      }
      if (normalized === 'github') {
        return ['github/tokens/'];
      }
      return [];
    });
    services.listVaultKeys.mockImplementation(async (mount: string, path = '') => {
      if (mount === 'secret' && path === 'github') {
        return ['token-app'];
      }
      return [];
    });
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
      secretSuggestionProvider: (...args: unknown[]) => Promise<unknown>;
      variableSuggestionProvider: (...args: unknown[]) => Promise<unknown>;
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

    await expect(sidebar.secretSuggestionProvider('')).resolves.toEqual(['secret/', 'kv/']);
    await expect(sidebar.secretSuggestionProvider('secret/')).resolves.toEqual(['secret/github/']);
    await expect(sidebar.secretSuggestionProvider('secret/github')).resolves.toEqual([
      'secret/github/tokens/',
    ]);
    await expect(sidebar.secretSuggestionProvider('secret/github/token')).resolves.toEqual([
      'secret/github/token-app',
    ]);
    expect(services.listVaultMounts).toHaveBeenCalledTimes(1);
    expect(services.listVaultPaths).toHaveBeenCalledWith('secret', '');
    expect(services.listVaultPaths).toHaveBeenCalledWith('secret', 'github');
    expect(services.listVaultKeys).toHaveBeenCalledWith('secret', 'github', { maskErrors: true });

    await expect(sidebar.variableSuggestionProvider('API')).resolves.toEqual(['API_TOKEN']);
    expect(services.listVariableKeys).toHaveBeenCalledTimes(1);

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

    await waitFor(() => expect(screen.getByText('Build Your AI Team')).toBeInTheDocument());
    expect(screen.queryByTestId('node-sidebar-mock')).not.toBeInTheDocument();
  });

  it('omits UI-only keys when persisting agent config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();
    const setEdges = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
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
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
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
