import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../AgentsThreads';
import { TestProviders, server, abs } from '../../../__tests__/integration/testUtils';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads deep linking', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function renderAt(path: string) {
    return render(
      <TestProviders>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/agents/threads">
              <Route index element={<AgentsThreads />} />
              <Route path=":threadId" element={<AgentsThreads />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    );
  }

  it('loads thread details when navigating directly to a thread id', async () => {
    const thread = {
      id: 'thread-1',
      alias: 'alias-1',
      summary: 'Thread from API',
      status: 'open',
      createdAt: t(0),
      parentId: null,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 },
      agentTitle: 'Agent Uno',
    };

    const runMeta = { id: 'run-1', threadId: 'thread-1', status: 'finished', createdAt: t(1), updatedAt: t(2) };

    const threadsHandler = () => HttpResponse.json({ items: [thread] });
    const threadHandler = () => HttpResponse.json(thread);
    const runsHandler = () => HttpResponse.json({ items: [runMeta] });
    const messagesHandler = () => HttpResponse.json({ items: [] });

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get('/api/agents/threads/thread-1', threadHandler),
      http.get(abs('/api/agents/threads/thread-1'), threadHandler),
      http.get('/api/agents/threads/thread-1/runs', runsHandler),
      http.get(abs('/api/agents/threads/thread-1/runs'), runsHandler),
      http.get('/api/agents/threads/thread-1/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/thread-1/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/runs/run-1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run-1/messages'), messagesHandler),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    renderAt('/agents/threads/thread-1');

    expect(await screen.findByRole('heading', { name: 'Thread from API' })).toBeInTheDocument();
    expect(screen.getByTestId('threads-list')).toBeInTheDocument();
  });

  it('shows a friendly error when the thread is missing', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/thread-missing', () => new HttpResponse(null, { status: 404 })),
      http.get(abs('/api/agents/threads/thread-missing'), () => new HttpResponse(null, { status: 404 })),
      http.get('/api/agents/threads/thread-missing/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/thread-missing/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    renderAt('/agents/threads/thread-missing');

    expect(
      await screen.findByText('Thread not found. The link might be invalid or the thread was removed.'),
    ).toBeInTheDocument();
  });
});
