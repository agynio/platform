import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { MemoryListPage } from '../MemoryListPage';

const templates = [
  {
    name: 'support-agent',
    title: 'Support Agent',
    kind: 'agent',
    sourcePorts: ['output'],
    targetPorts: ['input'],
  },
];

const graph = {
  name: 'main',
  version: 1,
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  nodes: [{ id: 'agent-1', template: 'support-agent', config: { title: 'Core Agent' } }],
  edges: [],
};

function primeGraphHandlers() {
  server.use(
    http.get(abs('/api/graph'), () => HttpResponse.json(graph)),
    http.get(abs('/api/graph/templates'), () => HttpResponse.json(templates)),
  );
}

describe('MemoryListPage', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders memory docs from the API response', async () => {
    primeGraphHandlers();
    server.use(
      http.get(abs('/api/memory/docs'), () =>
        HttpResponse.json({
          items: [
            { nodeId: 'agent-1', scope: 'global' },
            { nodeId: 'agent-1', scope: 'perThread', threadId: 'thread-9' },
          ],
        }),
      ),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <MemoryListPage />
        </MemoryRouter>
      </TestProviders>,
    );

    const titles = await screen.findAllByText('Core Agent');
    expect(titles).toHaveLength(2);
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('thread-9')).toBeInTheDocument();
    const managerLink = screen.getByRole('link', { name: /open memory manager/i });
    expect(managerLink).toHaveAttribute('href', '/agents/memory');
  });
});
