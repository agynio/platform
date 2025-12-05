import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { MemoryRouter } from 'react-router-dom';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads placeholder for missing summary', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders (no summary yet) when summary is null', async () => {
    const thread = { id: 'th1', alias: 'ignored-alias', summary: null, createdAt: t(0), metrics: { runsCount: 0 } };
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [thread] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [thread] })),
      http.get('*/api/agents/threads/tree', () =>
        HttpResponse.json({
          items: [
            {
              ...thread,
              hasChildren: false,
              children: [],
            },
          ],
        }),
      ),
    );
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );
    expect(await screen.findByText('(no summary yet)')).toBeInTheDocument();
  });
});
