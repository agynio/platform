import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { MemoryListPage } from '../MemoryListPage';

describe('MemoryListPage', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders memory docs from the API response', async () => {
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

    const titles = await screen.findAllByText('agent-1');
    expect(titles).toHaveLength(2);
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('thread-9')).toBeInTheDocument();
    const managerLink = screen.getByRole('link', { name: /open memory manager/i });
    expect(managerLink).toHaveAttribute('href', '/agents/memory');
  });
});
