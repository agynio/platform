import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';

function Harness({ expose }: { expose: (api: ReturnType<typeof useBuilderState>) => void }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs: 100 });
  useEffect(() => { expose(api); }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder position persistence', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  it('positions in graph survive reload via autosave payload', async () => {
    let savedPayload: any = null;
    server.use(
      http.get('http://localhost:3010/api/graph/templates', () =>
        HttpResponse.json([{ name: 'mock', title: 'Mock', kind: 'tool', sourcePorts: [], targetPorts: [] }]),
      ),
      http.get('http://localhost:3010/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 1, nodes: [{ id: 'n1', template: 'mock', config: {}, position: { x: 10, y: 15 } }], edges: [] }),
      ),
      http.post('http://localhost:3010/api/graph', async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        savedPayload = body;
        return HttpResponse.json({ version: 2, updatedAt: new Date().toISOString(), ...body });
      }),
    );

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
    expect(savedPayload).toBeTruthy();
    const n1 = (savedPayload?.nodes || []).find((n: any) => n.id === 'n1');
    expect(n1?.position).toEqual({ x: 10, y: 15 });

    // Simulate reload: server returns previously saved position
    server.use(
      http.get('http://localhost:3010/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 2, nodes: savedPayload.nodes, edges: savedPayload.edges }),
      ),
    );
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

