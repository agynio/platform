import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphLayout, type GraphLayoutServices } from '@/components/agents/GraphLayout';
import type { GraphNodeConfig, GraphPersistedEdge, GraphSaveState } from '@/features/graph/types';

const sidebarProps: any[] = [];
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
  default: () => <div data-testid="empty-sidebar-mock" />,
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

describe('GraphLayout workspace env integration', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    hookMocks.useMcpNodeState.mockReturnValue({
      tools: [],
      enabledTools: [],
      setEnabledTools: vi.fn(),
      isLoading: false,
    });
    hookMocks.useTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    hookMocks.useNodeAction.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
    canvasSpy.mockReset();
    listAllSecretPathsMock.mockReset();
    listAllSecretPathsMock.mockResolvedValue([]);
    services = createServiceMocks();
  });

  it('fetches flat secret suggestions for workspace nodes and caches them', async () => {
    const updateNode = vi.fn();

    mockGraphData({
      nodes: [
        {
          id: 'workspace-1',
          template: 'workspace-template',
          kind: 'Workspace',
          title: 'Workspace Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: {
            title: 'Workspace Node',
            env: [
              {
                name: 'DB_SECRET',
                value: { mount: 'kv', path: 'prod/app', key: 'TOKEN' },
              },
            ],
          },
          ports: { inputs: [], outputs: [] },
        },
      ],
      updateNode,
    });

    hookMocks.useGraphSocket.mockReturnValue(undefined);
    hookMocks.useNodeStatus.mockReturnValue({ data: null, refetch: vi.fn() });

    listAllSecretPathsMock.mockResolvedValue(['kv/prod/app/TOKEN', 'kv/prod/app/ALT']);

    render(<GraphLayout services={services} />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    const canvasProps = canvasSpy.mock.calls.at(-1)?.[0] as {
      onNodesChange?: (changes: any[]) => void;
    };

    act(() => {
      canvasProps.onNodesChange?.([
        {
          id: 'workspace-1',
          type: 'select',
          selected: true,
        },
      ]);
    });

    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));
    const sidebar = sidebarProps.at(-1) as {
      secretKeys: string[];
      ensureSecretKeys?: () => Promise<string[]>;
    };

    expect(sidebar.secretKeys).toEqual([]);

    await expect(sidebar.ensureSecretKeys?.()).resolves.toEqual(['kv/prod/app/TOKEN', 'kv/prod/app/ALT']);
    expect(listAllSecretPathsMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const latest = sidebarProps.at(-1) as { secretKeys: string[] };
      expect(latest.secretKeys).toEqual(['kv/prod/app/TOKEN', 'kv/prod/app/ALT']);
    });

    const afterFetch = sidebarProps.at(-1) as {
      ensureSecretKeys?: () => Promise<string[]>;
    };
    await expect(afterFetch.ensureSecretKeys?.()).resolves.toEqual(['kv/prod/app/TOKEN', 'kv/prod/app/ALT']);
    expect(listAllSecretPathsMock).toHaveBeenCalledTimes(1);
  });
});
