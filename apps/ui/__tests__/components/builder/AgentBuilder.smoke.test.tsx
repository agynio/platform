import React from 'react';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from '../../integration/testUtils';
import { AgentBuilder } from '../../../src/builder/AgentBuilder';

describe('AgentBuilder smoke render', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders without crashing and shows basic UI', async () => {
    // Provide builder API endpoints used by useBuilderState
    server.use(
      http.get('/api/templates', () =>
        HttpResponse.json([
          { name: 'agent.basic', title: 'Agent', kind: 'agent', sourcePorts: [], targetPorts: [] },
          { name: 'tool.basic', title: 'Tool', kind: 'tool', sourcePorts: [], targetPorts: [] },
        ]),
      ),
      http.get('/api/graph', () =>
        HttpResponse.json({
          name: 'g',
          version: 1,
          nodes: [
            { id: 'n1', template: 'agent.basic', config: {} },
            { id: 'n2', template: 'tool.basic', config: {} },
          ],
          edges: [],
        }),
      ),
    );

    render(
      <TestProviders>
        <AgentBuilder />
      </TestProviders>,
    );

    // Basic UI appears; if TDZ occurs, render would throw before this
    await waitFor(() => expect(screen.getByText(/Palette/i)).toBeInTheDocument());
    // Right panel header present (no selection initially)
    expect(screen.getByText('No Selection')).toBeInTheDocument();

    // Save status indicator is present with an accessible label
    const status = await screen.findByTestId('save-status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('role', 'status');
    // On initial hydration it should be idle/saved -> label should be defined
    expect(status.getAttribute('aria-label')).toBeTruthy();

    // Ensure the removed Fit button is not present
    expect(screen.queryByText('Fit')).toBeNull();
  });
});
