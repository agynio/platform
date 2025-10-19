import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from '../../integration/testUtils';
import { TooltipProvider } from '@hautech/ui';

// Shared API mocks
function mockApi() {
  server.use(
    http.get('/api/templates', () =>
      HttpResponse.json([
        { name: 'agent.basic', title: 'Agent', kind: 'agent', sourcePorts: [], targetPorts: [] },
        { name: 'tool.basic', title: 'Tool', kind: 'tool', sourcePorts: [], targetPorts: [] },
      ]),
    ),
    http.get('/api/graph', () => HttpResponse.json({ name: 'g', version: 1, nodes: [], edges: [] })),
    http.post('/api/graph', () => HttpResponse.json({ version: 2, updatedAt: new Date().toISOString() })),
  );
}

describe('Popover outside click behavior with/without dragging', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.resetModules();
  });
  afterAll(() => server.close());
  it('clicking outside closes when not dragging', async () => {
    mockApi();
    const { AgentBuilder } = await import('../../../src/builder/AgentBuilder');
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
    // Click outside the popover content
    await userEvent.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(addBtn).toHaveFocus();
    });
  });

  it('while dragging, onInteractOutside is prevented (stays open)', async () => {
    mockApi();
    // Mock react-dnd to report isDragging=true for useDrag to trigger internal isAnyDragging state
    vi.resetModules();
    vi.doMock('react-dnd', async () => {
      return {
        // Provide a pass-through provider
        DndProvider: ({ children }: { children: any }) => React.createElement(React.Fragment, null, children),
        // useDrop stub: return stable collector and no-op ref
        useDrop: () => [{ isOver: false }, () => {}] as any,
        // useDrag stub: report isDragging=true
        useDrag: () => [{ isDragging: true }, () => {}, () => {}] as any,
        // useDragLayer stub to avoid rendering issues
        useDragLayer: (collect: any) =>
          collect({
            getItem: () => null,
            isDragging: () => false,
            getClientOffset: () => null,
            getItemType: () => null,
          }),
      } as any;
    });
    const { AgentBuilder } = await import('../../../src/builder/AgentBuilder');
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
    // Attempt outside click should be prevented while dragging
    await userEvent.click(document.body);
    // Popover remains open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
