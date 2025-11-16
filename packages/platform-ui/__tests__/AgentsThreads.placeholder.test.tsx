import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { MemoryRouter } from 'react-router-dom';
import * as threadsModule from '../src/api/modules/threads';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

const THREAD_ID = '11111111-1111-1111-1111-111111111111';

describe('AgentsThreads placeholder for missing summary', () => {
  beforeAll(() => server.listen());
  beforeEach(() => {
    vi.spyOn(threadsModule.threads, 'resolveIdentifier').mockImplementation(async (identifier: string) => ({
      id: identifier,
      alias: identifier,
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  it('renders (no summary yet) when summary is null', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: 'ignored-alias', summary: null, createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: 'ignored-alias', summary: null, createdAt: t(0) }] }),
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
