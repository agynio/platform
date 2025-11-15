import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunTimeline } from '../AgentsRunTimeline';
import type { RunTimelineEvent, RunTimelineSummary, RunEventStatus, RunEventType } from '@/api/types/agents';

type MockedSummaryResult = {
  data: RunTimelineSummary;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

type MockedEventsResult = {
  data: { items: RunTimelineEvent[] };
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

const summaryRefetch = vi.fn();
const eventsRefetch = vi.fn();

const summaryMock = vi.fn<MockedSummaryResult, [string | undefined]>();
const eventsMock = vi.fn<MockedEventsResult, [string | undefined, { types: string[]; statuses: string[] }]>();

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => summaryMock(runId),
  useRunTimelineEvents: (runId: string | undefined, filters: { types: string[]; statuses: string[] }) =>
    eventsMock(runId, filters),
}));

const socketMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  runEvent: null as ((payload: { runId: string; event: RunTimelineEvent; mutation: 'append' | 'update' }) => void) | null,
  status: null as ((payload: { run: { id: string } }) => void) | null,
  reconnect: null as (() => void) | null,
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: {
    subscribe: socketMocks.subscribe,
    unsubscribe: socketMocks.unsubscribe,
    onRunEvent: vi.fn((cb: NonNullable<typeof socketMocks.runEvent>) => {
      socketMocks.runEvent = cb;
      return () => {
        socketMocks.runEvent = null;
      };
    }),
    onRunStatusChanged: vi.fn((cb: NonNullable<typeof socketMocks.status>) => {
      socketMocks.status = cb;
      return () => {
        socketMocks.status = null;
      };
    }),
    onReconnected: vi.fn((cb: NonNullable<typeof socketMocks.reconnect>) => {
      socketMocks.reconnect = cb;
      return () => {
        socketMocks.reconnect = null;
      };
    }),
  },
}));

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  return {
    id: 'event-1',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'tool_execution',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: '2024-01-01T00:00:00.000Z',
    endedAt: '2024-01-01T00:00:01.500Z',
    durationMs: 1500,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: 'span-1',
    metadata: {},
    errorCode: null,
    errorMessage: null,
    llmCall: undefined,
    toolExecution: {
      toolName: 'Search Tool',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: {},
      output: {},
      errorMessage: null,
      raw: null,
    },
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
    ...overrides,
  } satisfies RunTimelineEvent;
}

function buildSummary(events: RunTimelineEvent[]): RunTimelineSummary {
  const countsByType = events.reduce<Record<RunEventType, number>>((acc, ev) => {
    acc[ev.type] = (acc[ev.type] ?? 0) + 1;
    return acc;
  }, {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 0,
    summarization: 0,
  });
  const countsByStatus = events.reduce<Record<RunEventStatus, number>>((acc, ev) => {
    acc[ev.status] = (acc[ev.status] ?? 0) + 1;
    return acc;
  }, {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  });
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:02.000Z',
    firstEventAt: events[0]?.ts ?? null,
    lastEventAt: events[events.length - 1]?.ts ?? null,
    countsByType,
    countsByStatus,
    totalEvents: events.length,
  };
}

function LocationTracker() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(initialEntries: string[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/agents/threads/:threadId/runs/:runId"
            element={(
              <>
                <AgentsRunTimeline />
                <LocationTracker />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

beforeEach(() => {
  socketMocks.runEvent = null;
  socketMocks.status = null;
  socketMocks.reconnect = null;
  socketMocks.subscribe.mockClear();
  socketMocks.unsubscribe.mockClear();
  summaryRefetch.mockClear();
  eventsRefetch.mockClear();
  summaryMock.mockReset();
  eventsMock.mockReset();
  setMatchMedia(true);

  const events = [
    buildEvent(),
    buildEvent({
      id: 'event-2',
      ts: '2024-01-01T00:00:02.000Z',
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: null,
        rawResponse: null,
        toolCalls: [],
      },
    }),
  ];

  summaryMock.mockReturnValue({
    data: buildSummary(events),
    isLoading: false,
    isError: false,
    error: null,
    refetch: summaryRefetch,
  });

  eventsMock.mockReturnValue({
    data: { items: events },
    isFetching: false,
    isError: false,
    error: null,
    refetch: eventsRefetch,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AgentsRunTimeline layout and selection', () => {
  it('renders list/detail columns, honors URL selection, and supports keyboard navigation', async () => {
    const { getByRole, getByText, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1?eventId=event-2',
    ]);

    expect(socketMocks.subscribe).toHaveBeenCalledWith(['run:run-1']);

    const listbox = getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-labelledby', 'run-timeline-events-heading');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));

    const detailsBefore = getByTestId('timeline-event-details');
    expect(detailsBefore).toHaveTextContent('LLM Call');

    listbox.focus();
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });

    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1');
    const detailsAfter = getByTestId('timeline-event-details');
    expect(detailsAfter).toHaveTextContent('Tool Execution');
    expect(getByTestId('location').textContent).toContain('eventId=event-1');

    expect(getByText('Events')).toBeInTheDocument();
    expect(getByRole('region', { name: 'Run event details' })).toBeInTheDocument();
  });

  it('opens details in an accessible modal on mobile and clears selection on close', () => {
    setMatchMedia(false);
    const { getAllByText, queryByRole, getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1',
    ]);

    const firstItem = getAllByText('Tool Execution — Search Tool')[0];
    fireEvent.click(firstItem);

    const dialog = getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Tool Execution — Search Tool' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(queryByRole('dialog')).toBeNull();
    expect(getByTestId('location').textContent).not.toContain('eventId=');
  });
});

describe('AgentsRunTimeline socket reactions', () => {
  it('updates list on run_event_appended and triggers refetch on reconnect', async () => {
    const { findByText, getByTestId, unmount } = renderPage([
      '/agents/threads/thread-1/runs/run-1?eventId=event-1',
    ]);

    const newEvent = buildEvent({
      id: 'event-3',
      ts: '2024-01-01T00:00:03.000Z',
      type: 'summarization',
      toolExecution: undefined,
      summarization: {
        summaryText: 'done',
        newContextCount: 1,
        oldContextTokens: null,
        raw: null,
      },
    });

    await act(async () => {
      socketMocks.runEvent?.({ runId: 'run-1', event: newEvent, mutation: 'append' });
    });

    await findByText('Summarization');
    expect(summaryRefetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      socketMocks.status?.({ run: { id: 'run-1', status: 'finished', createdAt: '', updatedAt: '' } as any });
    });
    expect(summaryRefetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      socketMocks.reconnect?.();
    });
    expect(summaryRefetch).toHaveBeenCalledTimes(3);
    expect(eventsRefetch).toHaveBeenCalledTimes(1);

    expect(getByTestId('timeline-event-details')).toBeInTheDocument();
    unmount();
  });
});
