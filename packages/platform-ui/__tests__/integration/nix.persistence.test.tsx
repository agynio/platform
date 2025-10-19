import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from './testUtils';
// AgentBuilder not required in this harness
import { useEffect } from 'react';
import { TemplatesProvider as BuilderTemplatesProvider } from '@/builder/TemplatesProvider';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';
import { useBuilderState } from '@/builder/hooks/useBuilderState';
import { http, HttpResponse } from 'msw';

describe('Nix packages persistence in builder graph', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('stores selected packages under Workspace config.nix.packages and posts immutably', async () => {
    // Setup one containerProvider node as initial graph
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json([
          { name: 'containerProvider', title: 'Workspace', kind: 'service', sourcePorts: [], targetPorts: [], capabilities: { staticConfigurable: true } },
        ]),
      ),
      http.get('/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 1, nodes: [{ id: 'ws', template: 'containerProvider', config: { image: 'alpine:3' } }], edges: [] }),
      ),
    );

    let posted: any = null;
    server.use(
      http.post('/api/graph', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ version: (posted?.version ?? 0) + 1 });
      }),
    );

    // Render a minimal harness that uses builder state, programmatically selects the node,
    // and renders the RightPropertiesPanel (avoids ReactFlow visibility quirks in JSDOM)
    function Harness() {
      const state = useBuilderState(undefined, { debounceMs: 200 });
      useEffect(() => {
        if (!state.loading && state.nodes.length > 0) {
          const id = state.nodes[0].id;
          state.onNodesChange([{ id, type: 'select', selected: true } as any]);
        }
      }, [state.loading, state.nodes.length]);
      return (
        <BuilderTemplatesProvider templates={state.templates as any}>
          <RightPropertiesPanel node={state.selectedNode as any} onChange={state.updateNodeData} />
        </BuilderTemplatesProvider>
      );
    }

    render(
      <TestProviders>
        <Harness />
      </TestProviders>,
    );

    // Now search and select a package
    const input = await screen.findByLabelText('Search Nix packages');
    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop/ }));

    // Choose channel
    const select = await screen.findByLabelText(/Select version for htop/);
    // Ensure versions have loaded before selecting
    await screen.findByRole('option', { name: '1.2.3' });
    fireEvent.change(select, { target: { value: '1.2.3' } });
    // Note: selecting version updates config, which marks builder dirty and should trigger autosave.

    // Wait until autosave posts updated graph including nix.packages
    await waitFor(() => {
      expect(posted).toBeTruthy();
      const node = posted.nodes.find((n: any) => n.id === 'ws');
      expect(node.config.image).toBe('alpine:3');
      expect(Array.isArray(node.config?.nix?.packages)).toBe(true);
      expect(node.config.nix.packages.length).toBe(1);
      // New persistence stores four fields
      expect(node.config.nix.packages[0]).toEqual({ name: 'htop', version: '1.2.3', commitHash: 'abcd1234', attributePath: 'htop' });
    }, { timeout: 5000 });

    // Allow any trailing save-state timers to flush before teardown to avoid unhandled updates
    await new Promise((r) => setTimeout(r, 1600));
  });
});
