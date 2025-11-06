import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// Shared mutable store for hoisted mocks
(globalThis as any).__graphTest = { postCount: 0 };
vi.mock('@/api/modules/graph', () => ({
  graph: {
    getTemplates: vi.fn(async () => [{ name: 'mock', title: 'Mock', kind: 'tool', sourcePorts: [], targetPorts: [] }]),
    getFullGraph: vi.fn(async () => ({ name: 'g', version: 1, nodes: [{ id: 'n1', template: 'mock', config: {} }], edges: [] })),
    saveFullGraph: vi.fn(async () => { (globalThis as any).__graphTest.postCount += 1; return { version: Date.now() } as any; }),
  },
}));
import { render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';

function BuilderHarness({ expose }: { expose: (api: ReturnType<typeof useBuilderState>) => void }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs: 100 });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder autosave hydration gating', () => {
  const postSpy: { count: number } = { count: 0 };

  beforeAll(() => { (globalThis as any).__graphTest.postCount = 0; });
  afterEach(() => {
    postSpy.count = (globalThis as any).__graphTest.postCount;
    vi.useRealTimers();
  });
  afterAll(() => {});

  it('does not POST on initial hydration; posts once after edit (debounced) under StrictMode', async () => {
    (globalThis as any).__graphTest.postCount = 0;

    let exposed: ReturnType<typeof useBuilderState> | null = null;

    render(
      <React.StrictMode>
        <TestProviders>
          <BuilderHarness expose={(api) => (exposed = api)} />
        </TestProviders>
      </React.StrictMode>,
    );

    await waitFor(() => {
      // Wait until hook reports ready
      if (!exposed) throw new Error('not yet');
      expect(exposed.loading).toBe(false);
    });

    // Ensure no POST happened on hydration
    expect(postSpy.count).toBe(0);

    // Perform a user-initiated change: update node data
    exposed!.updateNodeData('n1', { name: 'edited' });

    // Wait beyond debounce
    await new Promise((r) => setTimeout(r, 150));

    // Exactly one POST should have occurred
    expect((globalThis as any).__graphTest.postCount).toBe(1);
  });
});
