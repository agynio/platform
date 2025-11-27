import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

type ReminderMock = {
  id: string;
  threadId: string;
  note: string;
  at: string;
  createdAt: string;
  completedAt: string | null;
};

const PRELOAD_CONCURRENCY = 4;

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

function makeReminder(overrides: Partial<ReminderMock> = {}): ReminderMock {
  return {
    id: 'reminder-1',
    threadId: 'thread-1',
    note: 'Reminder',
    at: t(3),
    createdAt: t(2),
    completedAt: null,
    ...overrides,
  };
}

function registerThreadScenario({
  thread,
  runs,
  children = [],
  reminders = [],
}: {
  thread: ThreadMock;
  runs: RunMock[];
  children?: ThreadMock[];
  reminders?: ReminderMock[];
}) {
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
    http.get('*/api/agents/reminders', () => HttpResponse.json({ items: reminders })),
    http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: reminders })),
    http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
    http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
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

  async function expectDetailStatus(summary: string, label: string) {
    const detailHeading = await screen.findByRole('heading', { name: summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText(label)).toBeInTheDocument();
  }

  function expectListStatus(summary: string, label: string) {
    const list = screen.getByTestId('threads-list');
    const summaryNode = within(list).getByText(summary);
    const row = summaryNode.parentElement?.parentElement as HTMLElement | null;
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByLabelText(label)).toBeInTheDocument();
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

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Running');
    expectListStatus(thread.summary, 'Running');
  });

  it('shows Finished when the latest run terminated', async () => {
    const thread = makeThread();
    const runs = [
      makeRun({ id: 'run-old', status: 'finished', createdAt: t(1), updatedAt: t(2) }),
      makeRun({ id: 'run-terminated', status: 'terminated', createdAt: t(6), updatedAt: t(7) }),
    ];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Finished');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Finished when the thread is closed and no runs are active', async () => {
    const thread = makeThread({ status: 'closed' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    const user = userEvent.setup();

    renderAt(`/agents/threads/${thread.id}`);

    await expectDetailStatus(thread.summary, 'Finished');
    const allButton = await screen.findByRole('button', { name: 'All' });
    await user.click(allButton);
    await screen.findByTestId('threads-list');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Finished when the thread is open without active runs, reminders, or running subthreads', async () => {
    const thread = makeThread({ status: 'open' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Finished');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Pending when the thread has active reminders', async () => {
    const thread = makeThread({ id: '11111111-1111-1111-1111-111111111111', status: 'open' });
    const reminders = [makeReminder({ id: 'rem-1', threadId: thread.id })];
    registerThreadScenario({ thread, runs: [], children: [], reminders });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Pending');
    expectListStatus(thread.summary, 'Pending');
  });

  it('shows Pending when a subthread is running', async () => {
    const thread = makeThread({ summary: 'Parent thread' });
    const childThread = makeThread({
      id: 'child-1',
      parentId: thread.id,
      summary: 'Child thread',
      metrics: { remindersCount: 0, containersCount: 0, activity: 'working', runsCount: 0 },
    });
    registerThreadScenario({
      thread,
      runs: [makeRun({ status: 'finished' })],
      children: [childThread],
    });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Pending');
    expectListStatus(thread.summary, 'Pending');
  });

  it('preloads subthreads when viewing the list without a selected thread', async () => {
    const thread = makeThread({ summary: 'Thread root' });
    const child = makeThread({ id: 'child-1', summary: 'Root child', parentId: thread.id, createdAt: t(10) });
    registerThreadScenario({ thread, runs: [], children: [child] });

    const user = userEvent.setup();

    renderAt('/agents/threads');

    const expandButton = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(expandButton);

    expect(screen.queryByText('Loading subthreads…')).not.toBeInTheDocument();
    expect(await screen.findByText('Root child')).toBeInTheDocument();
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

  it('respects preload concurrency across rerenders', async () => {
    const threads = Array.from({ length: 6 }).map((_, index) =>
      makeThread({
        id: `root-${index}`,
        alias: `alias-${index}`,
        summary: `Root thread ${index}`,
        createdAt: t(index * 10),
      }),
    );

    let pendingCount = 0;
    let maxPending = 0;
    const pendingResolvers: (() => void)[] = [];
    const started: string[] = [];

    server.use(
      http.get('*/api/agents/threads', () => HttpResponse.json({ items: threads })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: threads })),
      http.get('*/api/agents/threads/:threadId', ({ params }) => {
        const thread = threads.find((item) => item.id === params.threadId);
        if (!thread) {
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(thread);
      }),
      http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
        const thread = threads.find((item) => item.id === params.threadId);
        if (!thread) {
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(thread);
      }),
      http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
        const threadId = params.threadId as string;
        started.push(threadId);
        pendingCount += 1;
        maxPending = Math.max(maxPending, pendingCount);
        return new Promise<HttpResponse>((resolve) => {
          pendingResolvers.push(() => {
            pendingCount -= 1;
            resolve(HttpResponse.json({ items: [] }));
          });
        });
      }),
      http.get(abs('/api/agents/threads/:threadId/children'), ({ params }) => {
        const threadId = params.threadId as string;
        started.push(threadId);
        pendingCount += 1;
        maxPending = Math.max(maxPending, pendingCount);
        return new Promise<HttpResponse>((resolve) => {
          pendingResolvers.push(() => {
            pendingCount -= 1;
            resolve(HttpResponse.json({ items: [] }));
          });
        });
      }),
      http.options('*/api/agents/threads/:threadId/children', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/threads/:threadId/children'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    renderAt('/agents/threads');

    await screen.findByTestId('threads-list');

    await waitFor(() => {
      expect(started.length).toBeGreaterThanOrEqual(PRELOAD_CONCURRENCY);
    });

    expect(maxPending).toBeLessThanOrEqual(PRELOAD_CONCURRENCY);

    while (pendingResolvers.length > 0) {
      const resolveNext = pendingResolvers.shift();
      if (resolveNext) {
        resolveNext();
        // Allow new preload requests to register for the next iteration.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await waitFor(() => {
      expect(pendingCount).toBe(0);
    });

    expect(started).toHaveLength(threads.length);
    expect(maxPending).toBeLessThanOrEqual(PRELOAD_CONCURRENCY);
  });

  it('surfaces subthread preload failures without retrying endlessly', async () => {
    const thread = makeThread({ summary: 'Thread with failing children' });
    const runs = [makeRun({ id: 'run-with-failure' })];
    let callCount = 0;

    registerThreadScenario({ thread, runs, children: [] });

    server.use(
      http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
        if (params.threadId === thread.id) {
          callCount += 1;
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.options('*/api/agents/threads/:threadId/children', () => new HttpResponse(null, { status: 200 })),
    );

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(callCount).toBe(1);

    expect(await screen.findByText(/Failed to load subthreads/i)).toBeInTheDocument();
  });
});
