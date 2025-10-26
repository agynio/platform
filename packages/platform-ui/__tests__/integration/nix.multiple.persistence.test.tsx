import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from './testUtils';
import { http, HttpResponse } from 'msw';
import { TemplatesProvider as BuilderTemplatesProvider } from '@/builder/TemplatesProvider';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';
import { useBuilderState } from '@/builder/hooks/useBuilderState';
import type { NodeSelectionChange } from 'reactflow';

describe('Nix packages multiple persistence in builder graph', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('persists two selected packages in order and updates on removal', async () => {
    // Provide a minimal graph with a single Workspace node
    server.use(
      http.get('/api/graph/templates', () =>
        HttpResponse.json([
          { name: 'containerProvider', title: 'Workspace', kind: 'service', sourcePorts: [], targetPorts: [], capabilities: { staticConfigurable: true } },
        ]),
      ),
      http.get('/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 1, nodes: [{ id: 'ws', template: 'containerProvider', config: { image: 'alpine:3' } }], edges: [] }),
      ),
    );

    // Minimal posted graph payload for expectations
    interface PostedNode {
      id: string;
      template: string;
      config?: { nix?: { packages?: { name: string; version: string; commitHash: string; attributePath: string }[] } } & Record<string, unknown>;
      dynamicConfig?: Record<string, unknown>;
      position?: { x: number; y: number };
    }
    interface PostedGraphPayload {
      name?: string;
      version?: number;
      nodes: PostedNode[];
      edges: unknown[];
    }
    let posted: PostedGraphPayload | null = null;
    server.use(
      http.post('/api/graph', async ({ request }) => {
        posted = await request.json();
        const ver = typeof posted?.version === 'number' ? posted.version : 1;
        return HttpResponse.json({ version: ver + 1 });
      }),
    );

    function Harness() {
      const state = useBuilderState(undefined, { debounceMs: 200 });
      useEffect(() => {
        if (!state.loading && state.nodes.length > 0) {
          const id = state.nodes[0].id;
          const change: NodeSelectionChange = { id, type: 'select', selected: true };
          state.onNodesChange([change]);
        }
      }, [state.loading, state.nodes.length]);
      return (
        <BuilderTemplatesProvider templates={state.templates}>
          <RightPropertiesPanel node={state.selectedNode} onChange={state.updateNodeData} />
        </BuilderTemplatesProvider>
      );
    }

    render(
      <TestProviders>
        <Harness />
      </TestProviders>,
    );

    // Add first package: htop
    const input = await screen.findByLabelText('Search Nix packages');
    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop/ }));
    // Choose channel for htop
    const selectHtop = await screen.findByLabelText(/Select version for htop/);
    await screen.findByRole('option', { name: '1.2.3' });
    fireEvent.change(selectHtop, { target: { value: '1.2.3' } });

    // Add second package: git
    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'git' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /git/ }));
    const selectGit = await screen.findByLabelText(/Select version for git/);
    await screen.findByRole('option', { name: '1.0.0' });
    fireEvent.change(selectGit, { target: { value: '1.0.0' } });

    // Wait for autosave to persist both packages in order
    await waitFor(() => {
      expect(posted).toBeTruthy();
      const node = posted.nodes.find((n) => n.id === 'ws');
      const arr = node?.config?.nix?.packages ?? [];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBe(2);
      expect(arr[0]).toEqual({ name: 'htop', version: '1.2.3', commitHash: 'abcd1234', attributePath: 'htop' });
      expect(arr[1]).toEqual({ name: 'git', version: '1.0.0', commitHash: 'abcd1234', attributePath: 'git' });
    }, { timeout: 6000 });

    // Remove the first package and ensure persistence updates accordingly
    fireEvent.click(screen.getByLabelText('Remove htop'));

    await waitFor(() => {
      expect(posted).toBeTruthy();
      const node = posted.nodes.find((n) => n.id === 'ws');
      const arr = node?.config?.nix?.packages ?? [];
      expect(arr.length).toBe(1);
      expect(arr[0]).toEqual({ name: 'git', version: '1.0.0', commitHash: 'abcd1234', attributePath: 'git' });
    }, { timeout: 6000 });

    // Allow any debounced saves to flush to prevent state updates after test end
    await new Promise((r) => setTimeout(r, 500));
  });
});
