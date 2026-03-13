import { describe, expect, it } from 'vitest';
import type { PersistedGraph } from '../src/shared/types/graph.types';
import type { TeamsGraphSnapshot } from '../src/graph/teamsGraph.source';
import { HybridGraphRepository } from '../src/graph/hybridGraph.repository';
import { edgeKey } from '../src/graph/graph.utils';

describe('HybridGraphRepository mergeGraphs', () => {
  it('preserves FS-only nodes and merges Teams-managed nodes', () => {
    const repo = new HybridGraphRepository({} as any, {} as any);
    const base: PersistedGraph = {
      name: 'main',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
      nodes: [
        { id: 'trigger-1', template: 'trigger', config: { label: 'start' } },
        { id: 'agent-1', template: 'agent', config: { title: 'FS Agent' }, state: { status: 'idle' }, position: { x: 5, y: 7 } },
        { id: 'workspace-orphan', template: 'workspace', config: { title: 'FS Workspace' } },
      ],
      edges: [
        { source: 'trigger-1', sourceHandle: 'out', target: 'agent-1', targetHandle: 'in' },
        { source: 'workspace-orphan', sourceHandle: 'out', target: 'agent-1', targetHandle: 'in' },
      ],
      variables: [],
    };
    const teamsGraph: TeamsGraphSnapshot = {
      nodes: [
        { id: 'agent-1', template: 'agent', config: { title: 'Teams Agent' } },
        { id: 'workspace-1', template: 'workspace', config: { title: 'Teams Workspace' } },
      ],
      edges: [
        { source: 'workspace-1', sourceHandle: '$self', target: 'agent-1', targetHandle: 'tools' },
      ],
    };

    const merged = (repo as any).mergeGraphs(base, teamsGraph) as PersistedGraph;
    const nodesById = new Map(merged.nodes.map((node) => [node.id, node]));

    expect(nodesById.has('workspace-orphan')).toBe(false);
    expect(nodesById.get('trigger-1')).toMatchObject({ template: 'trigger', config: { label: 'start' } });
    expect(nodesById.get('workspace-1')).toMatchObject({ template: 'workspace', config: { title: 'Teams Workspace' } });
    expect(nodesById.get('agent-1')).toMatchObject({
      template: 'agent',
      config: { title: 'Teams Agent' },
      state: { status: 'idle' },
      position: { x: 5, y: 7 },
    });

    const edgeKeys = merged.edges.map(edgeKey);
    const expectedEdges = [
      edgeKey({ source: 'trigger-1', sourceHandle: 'out', target: 'agent-1', targetHandle: 'in' }),
      edgeKey({ source: 'workspace-1', sourceHandle: '$self', target: 'agent-1', targetHandle: 'tools' }),
    ];

    expect(edgeKeys).toHaveLength(expectedEdges.length);
    expect(edgeKeys).toEqual(expect.arrayContaining(expectedEdges));
  });
});
