import React from 'react';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from '../../integration/testUtils';
import { TooltipProvider } from '@hautech/ui';
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
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
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
    expect(dialog.getAttribute('data-state')).toBe('open');
  });

  it('supports keyboard navigation and insert on Enter', async () => {
    mockApi();
    render(
      <TestProviders>
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
      </TestProviders>,
    );
    fireEvent.click(await screen.findByTestId('add-node-button'));
    await screen.findByRole('dialog');
    const options = await screen.findAllByRole('option');
    // Ensure real focus is placed on the first option before keyboarding
    const first = options[0] as HTMLElement;
    first.focus();
    expect(first).toHaveFocus();
    // ArrowDown then Enter
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    fireEvent.keyDown(first, { key: 'Enter' });
    // After insert, popover transitions to closed state (forceMounted)
    await waitFor(() => {
      const dlg = screen.getByRole('dialog');
      expect(dlg.getAttribute('data-state')).toBe('closed');
    });
    expect(screen.getByTestId('add-node-button')).toHaveFocus();
  });

  it('ESC closes popover and returns focus to trigger', async () => {
    mockApi();
    render(
      <TestProviders>
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
      </TestProviders>,
    );
    const addBtn = await screen.findByTestId('add-node-button');
    await userEvent.click(addBtn);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-state')).toBe('open');
    // Press Escape
    await userEvent.keyboard('{Escape}');
    // Wait for closed state and focus return
    await waitFor(() => {
      const dlg = screen.getByRole('dialog');
      expect(dlg.getAttribute('data-state')).toBe('closed');
      expect(addBtn).toHaveFocus();
    });
  });

  it('Space on focused item inserts and closes popover', async () => {
    mockApi();
    render(
      <TestProviders>
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
      </TestProviders>,
    );
    const addBtn = await screen.findByTestId('add-node-button');
    await userEvent.click(addBtn);
    await screen.findByRole('dialog');
    const options = await screen.findAllByRole('option');
    const first = options[0] as HTMLElement;
    first.focus();
    expect(first).toHaveFocus();
    await userEvent.keyboard(' ');
    await waitFor(() => {
      const dlg = screen.getByRole('dialog');
      expect(dlg.getAttribute('data-state')).toBe('closed');
      expect(addBtn).toHaveFocus();
    });
  });

  it('list items are DnD sources (data-testid present) and click insert works', async () => {
    mockApi();
    render(
      <TestProviders>
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
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
