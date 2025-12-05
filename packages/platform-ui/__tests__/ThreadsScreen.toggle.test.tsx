import React from 'react';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import ThreadsScreen from '../src/components/screens/ThreadsScreen';
import { ThreadItem, type Thread } from '../src/components/ThreadItem';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';

const baseThread: Thread = {
  id: 'thread-1',
  summary: 'Investigate production error logs',
  agentName: 'Ops Agent',
  agentTitle: 'Ops Agent',
  createdAt: '2024-06-01T11:00:00.000Z',
  status: 'running',
  isOpen: true,
};

describe('ThreadsScreen thread status toggle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onToggleThreadStatus with the next state and shows relative time in the detail header', () => {
    const handleToggle = vi.fn();

    render(
      <ThreadsScreen
        threads={[baseThread]}
        runs={[]}
        containers={[]}
        reminders={[]}
        filterMode="all"
        selectedThreadId={baseThread.id}
        inputValue=""
        isRunsInfoCollapsed={false}
        threadsHasMore={false}
        threadsIsLoading={false}
        isLoading={false}
        isEmpty={false}
        onToggleThreadStatus={handleToggle}
      />,
    );

    const button = screen.getByRole('button', { name: /close thread/i });
    expect(button).not.toBeDisabled();

    button.click();

    expect(handleToggle).toHaveBeenCalledWith(baseThread.id, 'closed');

    const headerSummary = screen.getByRole('heading', { name: baseThread.summary });
    const headerContainer = headerSummary.parentElement as HTMLElement;
    const relativeLabel = within(headerContainer).getByText(/1 hour ago/i);
    expect(relativeLabel).toHaveAttribute('title', new Date(baseThread.createdAt).toLocaleString());
  });

  it('disables the toggle button while status update is pending', () => {
    render(
      <ThreadsScreen
        threads={[baseThread]}
        runs={[]}
        containers={[]}
        reminders={[]}
        filterMode="all"
        selectedThreadId={baseThread.id}
        inputValue=""
        isRunsInfoCollapsed={false}
        threadsHasMore={false}
        threadsIsLoading={false}
        isLoading={false}
        isEmpty={false}
        onToggleThreadStatus={() => {}}
        isToggleThreadStatusPending
      />,
    );

    const button = screen.getByRole('button', { name: /close thread/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ThreadItem relative time display', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders relative createdAt text with absolute time in the title', () => {
    const thread: Thread = {
      id: 'child-1',
      summary: 'Index nightly ETL job failures',
      agentName: 'Indexer',
      agentRole: 'Data Engineer',
      createdAt: '2024-06-01T11:59:00.000Z',
      status: 'pending',
      isOpen: true,
    };

    render(<ThreadItem thread={thread} />);

    const relativeLabel = screen.getByText(/ago/i);
    expect(relativeLabel.textContent).toMatch(/1 minute ago/i);
    expect(relativeLabel).toHaveAttribute('title', new Date(thread.createdAt).toLocaleString());
    expect(screen.getByTestId('thread-item-role')).toHaveTextContent('Data Engineer');
  });

  it('does not render agent role when value is empty', () => {
    const thread: Thread = {
      id: 'child-2',
      summary: 'Rotate credentials',
      agentName: 'Ops',
      agentRole: '',
      createdAt: '2024-06-01T11:50:00.000Z',
      status: 'finished',
      isOpen: true,
    };

    render(<ThreadItem thread={thread} />);

    expect(screen.queryByTestId('thread-item-role')).toBeNull();
  });
});

describe('AgentsThreads status toggle integration', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('updates the toggle label optimistically and stays in sync after refetch', async () => {
    const createdAt = '2024-06-01T11:00:00.000Z';
    let serverStatus: 'open' | 'closed' = 'open';
    let patchCalls = 0;
    let rootsRequestCount = 0;
    const recordRootFetch = () => {
      rootsRequestCount += 1;
    };

    const threadNode = () => ({
      id: 'th1',
      alias: 'th1',
      summary: 'Investigate production error logs',
      status: serverStatus,
      parentId: null,
      createdAt,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'working', runsCount: 0 },
      agentTitle: 'Ops Agent',
    });

    const respondWithThreads = () => {
      recordRootFetch();
      return HttpResponse.json({ items: [threadNode()] });
    };

    const handlePatch = async ({ request, params }: { request: Request; params?: Record<string, string> }) => {
      const threadId = params?.threadId ?? request.url.split('/').pop();
      if (threadId !== 'th1') {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { status?: 'open' | 'closed' };
      if (body.status) {
        patchCalls += 1;
        serverStatus = body.status;
      }
      return new HttpResponse(null, { status: 204 });
    };

    const treeHandler = () => {
      recordRootFetch();
      return HttpResponse.json({
        items: [
          {
            ...threadNode(),
            hasChildren: false,
            children: [],
          },
        ],
      });
    };

    server.use(
      http.get('/api/agents/threads', respondWithThreads),
      http.get(abs('/api/agents/threads'), respondWithThreads),
      http.get('/api/agents/threads/tree', treeHandler),
      http.get(abs('/api/agents/threads/tree'), treeHandler),
      http.get('/api/agents/threads/th1', () => HttpResponse.json(threadNode())),
      http.get(abs('/api/agents/threads/th1'), () => HttpResponse.json(threadNode())),
      http.get('/api/agents/threads/th1/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      http.patch('/api/agents/threads/:threadId', handlePatch),
      http.patch(abs('/api/agents/threads/:threadId'), handlePatch),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadRow = await screen.findByText('Investigate production error logs');
    fireEvent.click(threadRow);

    const closeToggle = await screen.findByRole('button', { name: /Close thread/i });
    expect(closeToggle).toBeInTheDocument();

    const initialRoots = rootsRequestCount;

    fireEvent.click(closeToggle);

    await screen.findByRole('button', { name: /Reopen thread/i });
    expect(screen.queryByRole('button', { name: /Close thread/i })).not.toBeInTheDocument();

    await waitFor(() => expect(patchCalls).toBeGreaterThan(0));
    await waitFor(() => expect(rootsRequestCount).toBeGreaterThan(initialRoots));
    expect(screen.getByRole('button', { name: /Reopen thread/i })).toBeInTheDocument();

    const beforeSecondToggleRoots = rootsRequestCount;

    const reopenToggle = await screen.findByRole('button', { name: /Reopen thread/i });
    fireEvent.click(reopenToggle);

    await screen.findByRole('button', { name: /Close thread/i });
    await waitFor(() => expect(patchCalls).toBeGreaterThan(1));
    await waitFor(() => expect(rootsRequestCount).toBeGreaterThan(beforeSecondToggleRoots));
    expect(screen.getByRole('button', { name: /Close thread/i })).toBeInTheDocument();
  });
});
