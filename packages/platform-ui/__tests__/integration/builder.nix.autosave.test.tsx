import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { PersistedGraph } from '@agyn/shared';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';
import { TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';

const graphMocks = vi.hoisted(() => ({
  getTemplatesMock: vi.fn(),
  getFullGraphMock: vi.fn(),
  saveFullGraphMock: vi.fn(),
})) as {
  getTemplatesMock: ReturnType<typeof vi.fn>;
  getFullGraphMock: ReturnType<typeof vi.fn>;
  saveFullGraphMock: ReturnType<typeof vi.fn>;
};

const template = {
  name: 'workspace',
  title: 'Workspace',
  kind: 'tool',
  sourcePorts: [],
  targetPorts: [],
};

const initialPackage = {
  name: 'git',
  version: '2.0.0',
  commitHash: 'abcd1234',
  attributePath: 'pkgs.git',
};

const makeGraph = (): PersistedGraph => ({
  name: 'main',
  version: 1,
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'workspace-1',
      template: 'workspace',
      position: { x: 0, y: 0 },
      config: { nix: { packages: [{ ...initialPackage }] } },
    },
  ],
  edges: [],
});

let persistedGraph: PersistedGraph = makeGraph();
const saveCalls: PersistedGraphUpsertRequestUI[] = [];

vi.mock('@/api/modules/graph', () => ({
  graph: {
    getTemplates: graphMocks.getTemplatesMock,
    getFullGraph: graphMocks.getFullGraphMock,
    saveFullGraph: graphMocks.saveFullGraphMock,
  },
}));

const { getTemplatesMock, getFullGraphMock, saveFullGraphMock } = graphMocks;

function BuilderHarness({ expose }: { expose: (api: ReturnType<typeof useBuilderState>) => void }) {
  const api = useBuilderState('', { debounceMs: 50 });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return <div data-testid="builder-status">{api.loading ? 'loading' : api.saveState}</div>;
}

function extractPackages(config: Record<string, unknown> | undefined): unknown[] | undefined {
  if (!config) return undefined;
  const nix = config['nix'];
  if (!nix || typeof nix !== 'object') return undefined;
  const packages = (nix as { packages?: unknown }).packages;
  return Array.isArray(packages) ? packages : [];
}

describe('Builder autosave nix packages', () => {
  beforeEach(() => {
    persistedGraph = makeGraph();
    saveCalls.length = 0;
    getTemplatesMock.mockReset();
    getFullGraphMock.mockReset();
    saveFullGraphMock.mockReset();

    getTemplatesMock.mockImplementation(async () => [template]);
    getFullGraphMock.mockImplementation(async () => JSON.parse(JSON.stringify(persistedGraph)) as PersistedGraph);
    saveFullGraphMock.mockImplementation(async (payload: PersistedGraphUpsertRequestUI) => {
      saveCalls.push(payload);
      const nextVersion = (persistedGraph.version ?? 0) + 1;
      const clonedNodes = payload.nodes.map((node) => ({
        id: node.id,
        template: node.template,
        position: node.position ?? { x: 0, y: 0 },
        config: node.config ? JSON.parse(JSON.stringify(node.config)) : undefined,
      }));
      const clonedEdges = payload.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? '',
        targetHandle: edge.targetHandle ?? '',
      }));
      persistedGraph = {
        name: payload.name,
        version: nextVersion,
        updatedAt: new Date().toISOString(),
        nodes: clonedNodes,
        edges: clonedEdges,
      };
      return { ...payload, version: persistedGraph.version, updatedAt: persistedGraph.updatedAt };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('posts empty packages after removal and persists across reload', async () => {
    let exposed: ReturnType<typeof useBuilderState> | null = null;

    const { unmount } = render(
      <React.StrictMode>
        <TestProviders>
          <BuilderHarness expose={(api) => (exposed = api)} />
        </TestProviders>
      </React.StrictMode>,
    );

    await waitFor(() => {
      if (!exposed) throw new Error('builder not ready');
      expect(exposed.loading).toBe(false);
    });

    const initialNode = exposed!.nodes.find((n) => n.id === 'workspace-1');
    expect(extractPackages(initialNode?.data.config as Record<string, unknown> | undefined)).toEqual([
      expect.objectContaining(initialPackage),
    ]);

    exposed!.updateNodeData('workspace-1', { config: { nix: { packages: [] } } });

    await waitFor(() => {
      expect(saveCalls).toHaveLength(1);
    });

    const payload = saveCalls[0];
    const payloadNode = payload.nodes.find((n) => n.id === 'workspace-1');
    expect(extractPackages(payloadNode?.config as Record<string, unknown> | undefined)).toEqual([]);

    await waitFor(() => {
      expect(exposed!.saveState).toBe('saved');
    });

    unmount();

    let rehydrated: ReturnType<typeof useBuilderState> | null = null;
    render(
      <React.StrictMode>
        <TestProviders>
          <BuilderHarness expose={(api) => (rehydrated = api)} />
        </TestProviders>
      </React.StrictMode>,
    );

    await waitFor(() => {
      if (!rehydrated) throw new Error('builder not ready after reload');
      expect(rehydrated.loading).toBe(false);
    });

    const rehydratedNode = rehydrated!.nodes.find((n) => n.id === 'workspace-1');
    expect(extractPackages(rehydratedNode?.data.config as Record<string, unknown> | undefined)).toEqual([]);
  });
});
