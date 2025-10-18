import React from 'react';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from '../../integration/testUtils';
import { AgentBuilder } from '../../../src/builder/AgentBuilder';
import { TooltipProvider } from '@hautech/ui';

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
        <TooltipProvider>
          <AgentBuilder />
        </TooltipProvider>
      </TestProviders>,
    );

    // Basic UI appears; if TDZ occurs, render would throw before this
    await waitFor(() => expect(screen.getByTestId('builder-toolbar')).toBeInTheDocument());
    // Right panel header present (no selection initially)
    expect(screen.getByText('No Selection')).toBeInTheDocument();

    // SaveStatusIndicator is rendered and no visible "Fit" control exists
    expect(screen.getByTestId('save-status')).toBeInTheDocument();
    expect(screen.queryByText('Fit')).not.toBeInTheDocument();
  });
});
