import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../AgentsThreads';
import { TestProviders, server, abs } from '../../../__tests__/integration/testUtils';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

type ThreadMock = {
  id: string;
  alias: string;
  summary: string;
  status: 'open' | 'closed';
  createdAt: string;
  parentId: string | null;
  metrics: { remindersCount: number; containersCount: number; activity: 'idle' | 'waiting' | 'working'; runsCount: number };
  agentTitle?: string | null;
};

type RunMock = {
  id: string;
  threadId: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};

function makeThread(overrides: Partial<ThreadMock> = {}): ThreadMock {
  return {
    id: 'thread-1',
    alias: 'alias-1',
    summary: 'Thread from API',
    status: 'open',
    createdAt: t(0),
    parentId: null,
    metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
    agentTitle: 'Agent Uno',
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunMock> = {}): RunMock {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'finished',
    createdAt: t(1),
    updatedAt: t(2),
    ...overrides,
  };
}

function registerThreadScenario({ thread, runs, children = [] }: { thread: ThreadMock; runs: RunMock[]; children?: ThreadMock[] }) {
  const threadPayload: ThreadMock = {
    ...thread,
    metrics: { ...thread.metrics, runsCount: runs.length },
  };
  server.use(
    http.get('*/api/agents/threads', () => HttpResponse.json({ items: [threadPayload] })),
    http.get('*/api/agents/threads/:threadId', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json(threadPayload);
      }
      return new HttpResponse(null, { status: 404 });
    }),
    http.get('*/api/agents/threads/:threadId/runs', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: runs });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: children });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.options('*/api/agents/threads/:threadId/children', () => new HttpResponse(null, { status: 200 })),
    http.get(abs('/api/agents/threads/:threadId/children'), ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: children });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.options(abs('/api/agents/threads/:threadId/children'), () => new HttpResponse(null, { status: 200 })),
    http.get('*/api/agents/runs/:runId/messages', () => HttpResponse.json({ items: [] })),
    http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
    http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
  );
}

describe('AgentsThreads page', () => {
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
    const thread = makeThread();
    const run = makeRun();
    registerThreadScenario({ thread, runs: [run], children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();
    expect(screen.getByTestId('threads-list')).toBeInTheDocument();
    expect(screen.queryByText('Agents / Threads')).not.toBeInTheDocument();
  });

  it('shows a friendly error when the thread is missing', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/thread-missing', () => new HttpResponse(null, { status: 404 })),
      http.get(abs('/api/agents/threads/thread-missing'), () => new HttpResponse(null, { status: 404 })),
      http.get('/api/agents/threads/thread-missing/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/thread-missing/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/thread-missing/children', () => new HttpResponse(null, { status: 404 })),
      http.get(abs('/api/agents/threads/thread-missing/children'), () => new HttpResponse(null, { status: 404 })),
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

  it('shows Running when any run is active', async () => {
    const thread = makeThread();
    const runs = [
      makeRun({ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(3) }),
      makeRun({ id: 'run-running', status: 'running', createdAt: t(4), updatedAt: t(5) }),
    ];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText('Running')).toBeInTheDocument();
  });

  it('shows Failed when the latest run terminated', async () => {
    const thread = makeThread();
    const runs = [
      makeRun({ id: 'run-old', status: 'finished', createdAt: t(1), updatedAt: t(2) }),
      makeRun({ id: 'run-terminated', status: 'terminated', createdAt: t(6), updatedAt: t(7) }),
    ];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText('Failed')).toBeInTheDocument();
  });

  it('shows Finished when the thread is closed and no runs are active', async () => {
    const thread = makeThread({ status: 'closed' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText('Finished')).toBeInTheDocument();
  });

  it('shows Pending when the thread is open without running or terminated runs', async () => {
    const thread = makeThread({ status: 'open' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText('Pending')).toBeInTheDocument();
  });

  it('preloads immediate subthreads for the selected thread', async () => {
    const thread = makeThread({ summary: 'Thread with children' });
    const runs = [makeRun({ id: 'run-with-children' })];
    const childOne = makeThread({ id: 'child-1', summary: 'First subthread', parentId: thread.id, createdAt: t(10) });
    const childTwo = makeThread({ id: 'child-2', summary: 'Second subthread', parentId: thread.id, createdAt: t(11) });
    registerThreadScenario({ thread, runs, children: [childOne, childTwo] });

    const user = userEvent.setup();

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();

    const expandButton = await screen.findByRole('button', { name: /Show 2 subthreads/i });
    await user.click(expandButton);

    expect(screen.queryByText('Loading subthreads…')).not.toBeInTheDocument();
    expect(await screen.findByText('First subthread')).toBeInTheDocument();
    expect(screen.getByText('Second subthread')).toBeInTheDocument();
  });
});
