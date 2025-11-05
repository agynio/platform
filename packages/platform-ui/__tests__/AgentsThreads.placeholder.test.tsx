import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server } from './integration/testUtils';
import { AgentsThreads } from '../src/pages/AgentsThreads';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads placeholder for missing summary', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders (no summary yet) when summary is null', async () => {
    server.use(
      http.get('http://localhost:3010/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'ignored-alias', summary: null, createdAt: t(0) }] }),
      ),
    );
    render(
      <TestProviders>
        <AgentsThreads />
      </TestProviders>,
    );
    expect(await screen.findByText('(no summary yet)')).toBeInTheDocument();
  });
});

