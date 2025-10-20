import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from './testUtils';
import { TemplatesProvider as BuilderTemplatesProvider } from '@/builder/TemplatesProvider';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';
import { useBuilderState } from '@/builder/hooks/useBuilderState';
import type { NodeSelectionChange } from 'reactflow';
import { http, HttpResponse } from 'msw';

describe('Nix removal behavior shrinks selection', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('shrinks when user removes one package', async () => {
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

    function Harness() {
      const state = useBuilderState(undefined, { debounceMs: 200 });
      React.useEffect(() => {
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

    const input = await screen.findByLabelText('Search Nix packages');
    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop/ }));
    const selectHtop = await screen.findByLabelText(/Select version for htop/);
    await screen.findByRole('option', { name: '1.2.3' });
    fireEvent.change(selectHtop, { target: { value: '1.2.3' } });

    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'git' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /git/ }));
    const selectGit = await screen.findByLabelText(/Select version for git/);
    await screen.findByRole('option', { name: '1.0.0' });
    fireEvent.change(selectGit, { target: { value: '1.0.0' } });

    // Remove htop explicitly
    fireEvent.click(screen.getByLabelText('Remove htop'));

    await waitFor(() => {
      expect(posted).toBeTruthy();
      const node = posted.nodes.find((n: any) => n.id === 'ws');
      const arr = node?.config?.nix?.packages ?? [];
      expect(arr.length).toBe(1);
      expect(arr[0]).toEqual({ name: 'git', version: '1.0.0', commitHash: 'abcd1234', attributePath: 'git' });
    }, { timeout: 6000 });
  });
});

