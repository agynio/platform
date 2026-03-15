import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { GraphNodeConfig, GraphNodeMetadata } from '@/features/graph/types';
import { useGraphData } from '../useGraphData';

const apiMocks = vi.hoisted(() => ({
  fetchTemplates: vi.fn(),
  fetchNodeStatus: vi.fn(),
}));

const teamsGraphMocks = vi.hoisted(() => ({
  fetchTeamsGraphSnapshot: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  graphApiService: apiMocks,
}));

vi.mock('../../services/teamsGraph', () => ({
  fetchTeamsGraphSnapshot: teamsGraphMocks.fetchTeamsGraphSnapshot,
}));

const graphResponse = {
  name: 'agents',
  version: 1,
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'node-1',
      template: 'agent',
      position: { x: 10, y: 20 },
      config: { title: 'Agent One' },
    },
  ],
  edges: [],
};

const templatesResponse = [
  {
    name: 'agent',
    title: 'Agent',
    kind: 'agent',
    sourcePorts: [],
    targetPorts: [],
  },
];

const statusResponse = { provisionStatus: { state: 'ready' } };

describe('useGraphData', () => {
  beforeEach(() => {
    teamsGraphMocks.fetchTeamsGraphSnapshot.mockResolvedValue(structuredClone(graphResponse));
    apiMocks.fetchTemplates.mockResolvedValue(structuredClone(templatesResponse));
    apiMocks.fetchNodeStatus.mockResolvedValue(structuredClone(statusResponse));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads snapshot data and applies status updates', async () => {
    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(teamsGraphMocks.fetchTeamsGraphSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.nodes).toHaveLength(1);

    await waitFor(() => {
      expect(result.current.nodes.at(0)?.status).toBe('ready');
    });
  });

  it('preserves title when profile fields change', async () => {
    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateNode('node-1', { config: { name: 'Voyager', role: 'Pathfinder' } });
    });

    const nodeConfig = result.current.nodes.at(0)?.config as Record<string, unknown> | undefined;
    expect(nodeConfig?.title).toBe('Agent One');
    expect(nodeConfig?.name).toBe('Voyager');
    expect(nodeConfig?.role).toBe('Pathfinder');
  });

  it('removes nodes and connected edges via removeNodes', async () => {
    const graphWithEdges = structuredClone(graphResponse);
    graphWithEdges.nodes = [
      ...graphWithEdges.nodes,
      {
        id: 'node-2',
        template: 'agent',
        position: { x: 40, y: 80 },
        config: { title: 'Agent Two' },
      },
    ];
    graphWithEdges.edges = [
      {
        id: 'node-1-$__node-2-$',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: '$',
        targetHandle: '$',
      },
    ];

    teamsGraphMocks.fetchTeamsGraphSnapshot.mockResolvedValueOnce(structuredClone(graphWithEdges));

    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nodes.some((node) => node.id === 'node-1')).toBe(true);
    expect(result.current.edges).toHaveLength(1);

    act(() => {
      result.current.removeNodes(['node-1']);
    });

    expect(result.current.nodes.some((node) => node.id === 'node-1')).toBe(false);
    expect(result.current.edges).toHaveLength(0);
  });

  it('adds nodes via addNode', async () => {
    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const newNode: GraphNodeConfig = {
      id: 'node-2',
      template: 'agent',
      kind: 'Agent',
      title: 'Agent Two',
      x: 50,
      y: 60,
      status: 'not_ready',
      config: { title: 'Agent Two' },
      ports: { inputs: [{ id: 'in', title: 'IN' }], outputs: [{ id: 'out', title: 'OUT' }] },
    };

    act(() => {
      result.current.addNode(newNode, {
        template: 'agent',
        config: { title: 'Agent Two' },
        position: { x: 50, y: 60 },
      });
      result.current.scheduleSave();
    });

    expect(result.current.nodes.some((node) => node.id === 'node-2')).toBe(true);
  });

  it('throws when addNode receives an invalid id', async () => {
    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(() => {
      act(() => {
        result.current.addNode({} as GraphNodeConfig, {} as GraphNodeMetadata);
      });
    }).toThrow('Graph node id is required');
  });
});
