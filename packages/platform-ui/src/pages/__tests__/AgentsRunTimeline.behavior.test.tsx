import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunTimeline } from '../AgentsRunTimeline';
import type { RunTimelineEvent, RunTimelineSummary, RunTimelineEventsCursor } from '@/api/types/agents';

type MockedSummaryResult = {
  data: RunTimelineSummary;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

type MockedEventsResult = {
  data: { items: RunTimelineEvent[]; nextCursor: RunTimelineEventsCursor | null };
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

type TimelineFilters = {
  types: string[];
  statuses: string[];
  limit?: number;
  order?: 'asc' | 'desc';
  cursor?: RunTimelineEventsCursor | null;
};

const summaryRefetch = vi.fn();
const eventsRefetch = vi.fn();
const summaryMock = vi.fn<MockedSummaryResult, [string | undefined]>();
const eventsMock = vi.fn<MockedEventsResult, [string | undefined, TimelineFilters]>();
const loadOlderMock = vi.hoisted(() => vi.fn());

const setMatchMedia = (value: boolean) => {
  (window.matchMedia as unknown) = vi.fn().mockImplementation(() => ({
    matches: value,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => summaryMock(runId),
  useRunTimelineEvents: (runId: string | undefined, filters: TimelineFilters) => eventsMock(runId, filters),
}));

vi.mock('@/api/modules/runs', () => ({
  runs: {
    timelineEvents: loadOlderMock,
  },
}));

const socketMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: {
    subscribe: socketMocks.subscribe,
    unsubscribe: socketMocks.unsubscribe,
    onRunEvent: vi.fn(() => () => {}),
    onRunStatusChanged: vi.fn(() => () => {}),
    onReconnected: vi.fn(() => () => {}),
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
    endedAt: '2024-01-01T00:00:01.000Z',
    durationMs: 1000,
    nodeId: null,
    sourceKind: 'run_step',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'calculator',
      input: '{}',
      output: '{}',
      error: null,
      outputFormat: 'json',
    },
    llmCall: null,
    summarization: null,
    injection: null,
    invocationMessage: null,
    attachments: [],
    ...overrides,
  } satisfies RunTimelineEvent;
}

function renderPage(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/agents/threads/:threadId/runs/:runId" element={<AgentsRunTimeline />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AgentsRunTimeline pagination behavior', () => {
  beforeEach(() => {
    summaryRefetch.mockReset();
    eventsRefetch.mockReset();
    summaryMock.mockReset();
    eventsMock.mockReset();
    loadOlderMock.mockReset();
    socketMocks.subscribe.mockReset();
    socketMocks.unsubscribe.mockReset();
    setMatchMedia(true);

    summaryMock.mockReturnValue({
      data: {
        runId: 'run-1',
        threadId: 'thread-1',
        status: 'success',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:03.000Z',
        firstEventAt: '2024-01-01T00:00:01.000Z',
        lastEventAt: '2024-01-01T00:00:03.000Z',
        countsByType: {
          invocation_message: 0,
          injection: 0,
          llm_call: 0,
          tool_execution: 3,
          summarization: 0,
        },
        countsByStatus: {
          pending: 0,
          running: 0,
          success: 3,
          error: 0,
          cancelled: 0,
        },
        totalEvents: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: summaryRefetch,
    });

    const events = [
      buildEvent({ id: 'event-1', ts: '2024-01-01T00:00:01.000Z' }),
      buildEvent({ id: 'event-2', ts: '2024-01-01T00:00:02.000Z' }),
      buildEvent({ id: 'event-3', ts: '2024-01-01T00:00:03.000Z' }),
    ];

    eventsMock.mockReturnValue({
      data: { items: events, nextCursor: null },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    });

    loadOlderMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the newest 100 items and scrolls to bottom on initial load', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { getByRole } = renderPage(['/agents/threads/thread-1/runs/run-1']);

    await waitFor(() => expect(eventsMock).toHaveBeenCalled());
    const filters = eventsMock.mock.calls.at(-1)?.[1];
    expect(filters?.limit).toBe(100);
    expect(filters?.order).toBe('desc');

    const listbox = getByRole('listbox');
    let scrollTopValue = 0;
    Object.defineProperty(listbox, 'clientHeight', { configurable: true, value: 160 });
    Object.defineProperty(listbox, 'scrollHeight', { configurable: true, value: 640 });
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (val) => {
        scrollTopValue = val;
      },
    });

    await act(async () => {
      const callbacks = rafCallbacks.splice(0);
      callbacks.forEach((cb) => cb(0));
    });

    expect(scrollTopValue).toBe(640);

    rafSpy.mockRestore();
  });

  it('loads older events when scrolled near the top and preserves viewport offset', async () => {
    const initialEvents = [
      buildEvent({ id: 'event-1', ts: '2024-01-01T00:00:01.000Z' }),
      buildEvent({ id: 'event-2', ts: '2024-01-01T00:00:02.000Z' }),
      buildEvent({ id: 'event-3', ts: '2024-01-01T00:00:03.000Z' }),
    ];

    eventsMock.mockImplementation(() => ({
      data: { items: initialEvents, nextCursor: { ts: '2023-12-31T23:59:50.000Z', id: 'cursor-prev' } },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    }));

    const olderEvent = buildEvent({
      id: 'event-0',
      ts: '2023-12-31T23:59:59.000Z',
      type: 'summarization',
      toolExecution: undefined,
      summarization: {
        summaryText: 'older',
        newContextCount: 1,
        oldContextTokens: null,
        raw: null,
      },
    });

    loadOlderMock.mockResolvedValueOnce({
      items: [olderEvent, initialEvents[1]],
      nextCursor: null,
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { getByRole, getAllByRole } = renderPage(['/agents/threads/thread-1/runs/run-1']);

    await waitFor(() => expect(eventsMock).toHaveBeenCalled());

    const listbox = getByRole('listbox');
    const ITEM_HEIGHT = 60;
    Object.defineProperty(listbox, 'clientHeight', { configurable: true, value: ITEM_HEIGHT * 2 });
    Object.defineProperty(listbox, 'scrollHeight', {
      configurable: true,
      get: () => listbox.childElementCount * ITEM_HEIGHT,
    });
    let scrollTopValue = 0;
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (val) => {
        scrollTopValue = val;
      },
    });

    await act(async () => {
      const callbacks = rafCallbacks.splice(0);
      callbacks.forEach((cb) => cb(0));
    });

    expect(scrollTopValue).toBe(listbox.scrollHeight);

    const previousHeight = listbox.scrollHeight;
    listbox.scrollTop = 5;

    await act(async () => {
      fireEvent.scroll(listbox);
    });

    await waitFor(() => expect(loadOlderMock).toHaveBeenCalledTimes(1));
    const [runId, params] = loadOlderMock.mock.calls[0];
    expect(runId).toBe('run-1');
    expect(params).toMatchObject({ limit: 100, order: 'desc', cursorTs: '2023-12-31T23:59:50.000Z', cursorId: 'cursor-prev' });

    await act(async () => {
      const callbacks = rafCallbacks.splice(0);
      callbacks.forEach((cb) => cb(0));
    });

    const expectedTop = 5 + (listbox.scrollHeight - previousHeight);
    expect(scrollTopValue).toBe(expectedTop);

    const options = getAllByRole('option');
    expect(options[0]).toHaveAttribute('data-event-id', 'event-0');
    const uniqueIds = new Set(options.map((opt) => opt.getAttribute('data-event-id')));
    expect(uniqueIds.size).toBe(options.length);

    rafSpy.mockRestore();
  });
});
