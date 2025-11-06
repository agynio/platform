import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// Shared store for hoisted mocks
(globalThis as any).__graphTest = { saved: null };
vi.mock('@/api/modules/graph', () => ({
  graph: {
    getTemplates: vi.fn(async () => [{ name: 'mock', title: 'Mock', kind: 'tool', sourcePorts: [], targetPorts: [] }]),
    getFullGraph: vi.fn(async () => {
      const saved = (globalThis as any).__graphTest.saved;
      if (saved) return { name: 'g', version: 2, nodes: saved.nodes, edges: saved.edges };
      return { name: 'g', version: 1, nodes: [{ id: 'n1', template: 'mock', config: {}, position: { x: 10, y: 15 } }], edges: [] };
    }),
    saveFullGraph: vi.fn(async (body: any) => { (globalThis as any).__graphTest.saved = body; return { version: 2, updatedAt: new Date().toISOString(), ...body }; }),
  },
}));
import { render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';

function Harness({ expose }: { expose: (api: ReturnType<typeof useBuilderState>) => void }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs: 100 });
  useEffect(() => { expose(api); }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder position persistence', () => {
  beforeAll(() => { (globalThis as any).__graphTest.saved = null; });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(() => {});

  it('positions in graph survive reload via autosave payload', async () => {

    let api: ReturnType<typeof useBuilderState> | null = null;
    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );
    await waitFor(() => expect(api?.loading).toBe(false));
    // Trigger a save by changing name (data change)
    api!.updateNodeData('n1', { name: 'changed' });
    await new Promise((r) => setTimeout(r, 150));
    const savedPayload = (globalThis as any).__graphTest.saved;
    expect(savedPayload).toBeTruthy();
    const n1 = (savedPayload.nodes || []).find((n: any) => n.id === 'n1');
    expect(n1?.position).toEqual({ x: 10, y: 15 });

    // Simulate reload: mocked getFullGraph will return saved payload
    // Re-render hook to simulate reload
    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );
    await waitFor(() => expect(api?.loading).toBe(false));
    const nodeAfter = api!.nodes.find((n) => n.id === 'n1');
    expect(nodeAfter?.position).toEqual({ x: 10, y: 15 });
  });
});
