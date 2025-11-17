import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const hoisted = vi.hoisted(() => {
  const socketMock = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onThreadActivityChanged: vi.fn(() => () => {}),
    onThreadRemindersCount: vi.fn(() => () => {}),
    onMessageCreated: vi.fn(() => () => {}),
    onRunStatusChanged: vi.fn(() => () => {}),
    onReconnected: vi.fn(() => () => {}),
  };
  return {
    threadById: vi.fn(),
    threadRuns: vi.fn(),
    httpGet: vi.fn(() => Promise.resolve({ items: [] })),
    socket: socketMock,
  };
});

const threadByIdMock = hoisted.threadById;
const threadRunsMock = hoisted.threadRuns;

vi.mock('@/api/hooks/threads', () => ({
  useThreadById: (threadId: string | undefined) => threadByIdMock(threadId),
}));

vi.mock('@/api/hooks/runs', () => ({
  useThreadRuns: (threadId: string | undefined) => threadRunsMock(threadId),
}));

vi.mock('@/api/http', () => ({
  http: {
    get: hoisted.httpGet,
  },
  asData: <T,>(promise: Promise<T>) => promise,
}));

vi.mock('@/api/modules/runs', () => ({
  runs: {
    messages: vi.fn(() => Promise.resolve({ items: [] })),
  },
}));

vi.mock('@/components/agents/ThreadTree', () => ({
  ThreadTree: () => <div data-testid="thread-tree" />, // simplified stub
}));

vi.mock('@/components/agents/RunMessageList', () => ({
  RunMessageList: (props: { items: Array<{ type?: string; reminder?: { id: string } }> }) => (
    <div data-testid="run-message-list">
      {props.items.map((item, idx) =>
        item && item.type === 'reminder' && item.reminder ? (
          <div key={`reminder-${item.reminder.id}-${idx}`} data-testid="reminder-countdown-row" />
        ) : null
      )}
    </div>
  ),
}));

vi.mock('@/components/agents/ThreadHeader', () => ({
  ThreadHeader: ({ thread }: { thread: { summary?: string | null } | undefined }) => (
    <div data-testid="thread-header">{thread?.summary ?? 'no-thread'}</div>
  ),
}));

vi.mock('@/components/agents/ThreadStatusFilterSwitch', () => ({
  ThreadStatusFilterSwitch: ({ value }: { value: string }) => (
    <div data-testid="thread-status-filter">filter:{value}</div>
  ),
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: hoisted.socket,
}));

import { AgentsThreads } from '../AgentsThreads';

function renderWithProviders(initialEntry: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AgentsThreads deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const defaultRunsResult = {
      data: { items: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    };
    threadRunsMock.mockReturnValue(defaultRunsResult);
  });

  it('renders thread details from route-loaded thread id', async () => {
    threadByIdMock.mockReturnValue({
      data: {
        id: 'thread-1',
        alias: 'alias-1',
        summary: 'Thread from API',
        status: 'open',
        createdAt: '2024-01-01T00:00:00.000Z',
        parentId: null,
      },
      isError: false,
      isLoading: false,
      isPending: false,
      error: null,
    });

    renderWithProviders(
      '/agents/threads/thread-1',
      <Routes>
        <Route path="/agents/threads/:threadId" element={<AgentsThreads />} />
      </Routes>,
    );

    await waitFor(() => expect(threadByIdMock).toHaveBeenCalledWith('thread-1'));
    expect(screen.getByTestId('thread-header')).toHaveTextContent('Thread from API');
    expect(screen.queryByText('Thread not found')).not.toBeInTheDocument();
  });

  it('shows friendly error and navigates back on invalid id', async () => {
    const notFoundError = {
      message: 'thread_not_found',
      response: { status: 404 },
    } as const;

    threadByIdMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      isPending: false,
      error: notFoundError,
    });

    let currentPath = '';
    const LocationSpy = () => {
      const location = useLocation();
      useEffect(() => {
        currentPath = location.pathname;
      }, [location.pathname]);
      return null;
    };

    const WithSpy = () => (
      <>
        <LocationSpy />
        <AgentsThreads />
      </>
    );

    renderWithProviders(
      '/agents/threads/bad-id',
      <Routes>
        <Route path="/agents/threads">
          <Route index element={<WithSpy />} />
          <Route path=":threadId" element={<WithSpy />} />
        </Route>
      </Routes>,
    );

    await waitFor(() => expect(threadByIdMock).toHaveBeenCalledWith('bad-id'));
    expect(screen.getByText('Thread not found')).toBeInTheDocument();
    expect(currentPath).toBe('/agents/threads/bad-id');

    const backButton = screen.getByRole('button', { name: 'Back to threads' });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(currentPath).toBe('/agents/threads');
    });
  });
});
