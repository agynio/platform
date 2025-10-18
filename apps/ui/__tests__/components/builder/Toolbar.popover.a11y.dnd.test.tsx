import React from 'react';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from '../../integration/testUtils';
import { AgentBuilder } from '../../../src/builder/AgentBuilder';

describe('Builder toolbar + popover + DnD', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function mockApi() {
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json([
          { name: 'agent.basic', title: 'Agent', kind: 'agent', sourcePorts: [], targetPorts: [] },
          { name: 'tool.basic', title: 'Tool', kind: 'tool', sourcePorts: [], targetPorts: [] },
        ]),
      ),
      http.get('/api/graph', () =>
        HttpResponse.json({ name: 'g', version: 1, nodes: [], edges: [] }),
      ),
      http.post('/api/graph', () => HttpResponse.json({ version: 2, updatedAt: new Date().toISOString() })),
    );
  }

  it('renders floating toolbar and opens popover with animation state classes', async () => {
    mockApi();
    render(
      <TestProviders>
        <AgentBuilder />
      </TestProviders>,
    );
    const toolbar = await screen.findByTestId('builder-toolbar');
    expect(toolbar).toBeInTheDocument();
    // Pointer-events overlay vs toolbar
    const overlay = toolbar.parentElement as HTMLElement;
    expect(overlay.className).toContain('pointer-events-none');
    expect(toolbar.className).toContain('pointer-events-auto');

    // Open popover
    const addBtn = screen.getByTestId('add-node-button');
    fireEvent.click(addBtn);

    // Content appears with data-state attributes driving classes (from @hautech/ui wrapper)
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('supports keyboard navigation and insert on Enter', async () => {
    mockApi();
    render(
      <TestProviders>
        <AgentBuilder />
      </TestProviders>,
    );
    fireEvent.click(await screen.findByTestId('add-node-button'));
    const listbox = await screen.findByRole('listbox');
    // ArrowDown then Enter
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    // After insert, popover transitions to closed state (forceMounted)
    await waitFor(() => {
      const dlg = screen.getByRole('dialog');
      expect(dlg.getAttribute('data-state')).toBe('closed');
    });
    expect(screen.getByTestId('add-node-button')).toHaveFocus();
  });

  it('list items are DnD sources (data-testid present) and click insert works', async () => {
    mockApi();
    render(
      <TestProviders>
        <AgentBuilder />
      </TestProviders>,
    );
    fireEvent.click(await screen.findByTestId('add-node-button'));
    const item = await screen.findByTestId('template-agent.basic');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('draggable', 'true');
    fireEvent.click(item);
    await waitFor(() => {
      const dlg = screen.getByRole('dialog');
      expect(dlg.getAttribute('data-state')).toBe('closed');
    });
  });
});
