import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import { server, TestProviders, abs } from './integration/testUtils';
import * as socketModule from '../src/lib/graph/socket';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('ThreadTree realtime summary updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('updates an existing root summary in place when thread_updated arrives', async () => {
    const handler: Parameters<typeof http.get>[1] = () =>
      HttpResponse.json({
        items: [
          {
            id: 'th1',
            alias: 'thread-one',
            summary: 'Original summary',
            status: 'open',
            parentId: null,
            createdAt: t(0),
            metrics: { remindersCount: 0, runsCount: 0, containersCount: 0, activity: 'idle' },
            agentName: 'Agent Uno',
          },
        ],
      });

    server.use(
      http.get('/api/agents/threads', handler),
      http.get(abs('/api/agents/threads'), handler),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    await screen.findByText('Original summary');

    const listeners = (socketModule.graphSocket as any).threadUpdatedListeners as Set<
      (payload: { thread: { id: string; summary: string; status: 'open' | 'closed'; createdAt: string; parentId: string | null; alias: string } }) => void
    >;
    for (const fn of listeners) {
      fn({
        thread: {
          id: 'th1',
          alias: 'thread-one',
          summary: 'Updated summary',
          status: 'open',
          parentId: null,
          createdAt: t(1),
        },
      });
    }

    await waitFor(() => expect(screen.getByText('Updated summary')).toBeInTheDocument());
  });
});
