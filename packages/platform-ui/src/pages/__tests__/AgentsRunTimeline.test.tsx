import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunTimeline } from '../AgentsRunTimeline';
import type { RunTimelineEvent, RunTimelineSummary, RunEventStatus, RunEventType, RunTimelineEventsCursor } from '@/api/types/agents';

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

const summaryRefetch = vi.fn();
const eventsRefetch = vi.fn();

const summaryMock = vi.fn<MockedSummaryResult, [string | undefined]>();
const eventsMock = vi.fn<MockedEventsResult, [
  string | undefined,
  { types: string[]; statuses: string[]; limit?: number; order?: 'asc' | 'desc'; cursor?: RunTimelineEventsCursor | null },
]>();

let eventsQueryState: MockedEventsResult;

const runsModule = vi.hoisted(() => ({
  timelineEvents: vi.fn(),
  terminate: vi.fn(),
}));

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => summaryMock(runId),
  useRunTimelineEvents: (
    runId: string | undefined,
    filters: { types: string[]; statuses: string[]; limit?: number; order?: 'asc' | 'desc'; cursor?: RunTimelineEventsCursor | null },
  ) => eventsMock(runId, filters),
}));

vi.mock('@/api/modules/runs', () => ({
  runs: {
    timelineEvents: runsModule.timelineEvents,
    terminate: runsModule.terminate,
  },
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

const socketMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  runEvent: null as ((payload: { runId: string; event: RunTimelineEvent; mutation: 'append' | 'update' }) => void) | null,
  status: null as ((payload: { run: { id: string } }) => void) | null,
  reconnect: null as (() => void) | null,
  runCursors: new Map<string, RunTimelineEventsCursor | null>(),
  setRunCursor: vi.fn((runId: string, cursor: RunTimelineEventsCursor | null) => {
    if (!runId) return;
    if (!cursor) {
      socketMocks.runCursors.delete(runId);
    } else {
      socketMocks.runCursors.set(runId, cursor);
    }
  }),
  getRunCursor: vi.fn((runId: string) => socketMocks.runCursors.get(runId) ?? null),
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
    setRunCursor: socketMocks.setRunCursor,
    getRunCursor: socketMocks.getRunCursor,
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
            path="/agents/threads/:threadId/runs/:runId/timeline"
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  socketMocks.runEvent = null;
  socketMocks.status = null;
  socketMocks.reconnect = null;
  socketMocks.subscribe.mockClear();
  socketMocks.unsubscribe.mockClear();
  socketMocks.setRunCursor.mockClear();
  socketMocks.getRunCursor.mockClear();
  socketMocks.runCursors.clear();
  summaryRefetch.mockClear();
  eventsRefetch.mockClear();
  runsModule.timelineEvents.mockReset();
  runsModule.terminate.mockReset();
  summaryMock.mockReset();
  eventsMock.mockReset();
  notifyMocks.success.mockReset();
  notifyMocks.error.mockReset();
  setMatchMedia(true);
  window.localStorage.clear();

  runsModule.terminate.mockResolvedValue({ ok: true });

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

  eventsQueryState = {
    data: { items: events, nextCursor: null },
    isFetching: false,
    isError: false,
    error: null,
    refetch: eventsRefetch,
  };

  eventsMock.mockImplementation(() => eventsQueryState);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AgentsRunTimeline layout and selection', () => {
  it('renders list/detail columns, honors URL selection, and supports keyboard navigation', async () => {
    const { getByRole, getByText, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-2',
    ]);

    expect(socketMocks.subscribe).toHaveBeenCalledWith(['run:run-1']);

    const listbox = getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-labelledby', 'run-timeline-events-heading');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=true'));
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('true'));

    const detailsBefore = getByTestId('timeline-event-details');
    expect(detailsBefore).toHaveTextContent('LLM Call');

    listbox.focus();
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });

    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1'));
    const detailsAfter = getByTestId('timeline-event-details');
    expect(detailsAfter).toHaveTextContent('Tool Execution');
    expect(getByTestId('location').textContent).toContain('eventId=event-1');
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('false'));

    expect(getByText('Events')).toBeInTheDocument();
    expect(getByRole('region', { name: 'Run event details' })).toBeInTheDocument();
  });

  it('opens details in an accessible modal on mobile and clears selection on close', async () => {
    setMatchMedia(false);
    const { queryByRole, getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('false'));

    const firstItem = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
    if (!firstItem) throw new Error('List option not found');
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
  it('replaces existing events on update and displays refreshed tool output', async () => {
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-1&follow=false',
    ]);

    const listbox = getByRole('listbox');
    const option = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
    expect(option).not.toBeNull();
    if (!option) throw new Error('List option not found');
    expect(within(option).getByText('success')).toBeInTheDocument();

    const updated = buildEvent({
      id: 'event-1',
      status: 'error',
      errorMessage: 'Tool exploded',
      toolExecution: {
        toolName: 'Search Tool',
        toolCallId: 'call-1',
        execStatus: 'error',
        input: { query: 'status' },
        output: { answer: 42 },
        errorMessage: 'Tool exploded',
        raw: null,
      },
    });

    await act(async () => {
      socketMocks.runEvent?.({ runId: 'run-1', event: updated, mutation: 'update' });
    });

    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(option).getByText('error')).toBeInTheDocument());

    const details = getByTestId('timeline-event-details');
    expect(details).toHaveTextContent('Tool Execution — Search Tool');
    expect(details).toHaveTextContent('error');
    expect(details).toHaveTextContent('"answer": 42');
    expect(details).toHaveTextContent('Error: Tool exploded');
  });

  it('merges socket updates and performs cursor catch-up after reconnect', async () => {
    const { findByText, getByTestId, unmount } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-1&follow=false',
    ]);

    const appended = buildEvent({
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
      socketMocks.runEvent?.({ runId: 'run-1', event: appended, mutation: 'append' });
    });

    await findByText('Summarization');
    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    expect(socketMocks.setRunCursor).toHaveBeenCalled();

    await act(async () => {
      socketMocks.status?.({ run: { id: 'run-1', status: 'finished', createdAt: '', updatedAt: '' } as any });
    });
    expect(summaryRefetch).toHaveBeenCalledTimes(2);

    const caughtUp = buildEvent({
      id: 'event-4',
      ts: '2024-01-01T00:00:04.000Z',
      type: 'tool_execution',
      toolExecution: {
        toolName: 'Weather',
        toolCallId: 'call-4',
        execStatus: 'success',
        input: { location: 'NYC' },
        output: { result: 'Sunny' },
        errorMessage: null,
        raw: null,
      },
    });
    runsModule.timelineEvents.mockResolvedValue({ items: [caughtUp], nextCursor: null });

    await act(async () => {
      socketMocks.reconnect?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(runsModule.timelineEvents).toHaveBeenCalledTimes(1));
    expect(runsModule.timelineEvents).toHaveBeenCalledWith('run-1', expect.objectContaining({
      types: undefined,
      cursorTs: appended.ts,
      cursorId: appended.id,
      cursorParamMode: 'both',
    }));
    expect(summaryRefetch).toHaveBeenCalledTimes(3);
    expect(eventsRefetch).not.toHaveBeenCalled();
    await findByText('Tool Execution — Weather');

    expect(getByTestId('timeline-event-details')).toBeInTheDocument();
    unmount();
  });
});

describe('AgentsRunTimeline follow mode', () => {
  it('defaults to follow on desktop and auto-selects the latest event', async () => {
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=true'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('eventId=event-2'));
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('true'));
  });

  it('defaults to manual mode on mobile without auto-selecting an event', async () => {
    setMatchMedia(false);
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    expect(listbox.getAttribute('aria-activedescendant')).toBeNull();
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('false'));
  });

  it('turns follow off on manual selection and keeps focus on the chosen event', async () => {
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));

    const firstItem = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
    if (!firstItem) throw new Error('List option not found');
    fireEvent.click(firstItem);

    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1'));

    const appended = buildEvent({
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
      socketMocks.runEvent?.({ runId: 'run-1', event: appended, mutation: 'append' });
    });

    await waitFor(() => expect(within(listbox).getByText('Summarization')).toBeInTheDocument());
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1');
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('false'));
  });

  it('re-enables follow and selects the newest event when toggled back on', async () => {
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));
    const firstOption = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
    if (!firstOption) throw new Error('List option not found');
    fireEvent.click(firstOption);
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));

    const appended = buildEvent({
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
      socketMocks.runEvent?.({ runId: 'run-1', event: appended, mutation: 'append' });
    });
    await waitFor(() => expect(within(listbox).getByText('Summarization')).toBeInTheDocument());
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1');

    const toggle = getByRole('switch', { name: 'Follow latest events' });
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-3'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=true'));
    await waitFor(() => expect(window.localStorage.getItem('timeline-follow:run-1')).toBe('true'));
  });

  it('updates selection on filter changes while following', async () => {
    const { getByRole, getByText, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));

    const llmFilter = getByRole('button', { name: 'LLM' });
    fireEvent.click(llmFilter);

    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=true'));
    expect(getByTestId('location').textContent).toContain('eventId=event-1');
    expect(getByText('Following')).toBeInTheDocument();
  });

  it('clears selection on filter changes when in manual mode', async () => {
    const { getByRole, getByTestId } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-2'));
    const firstOption = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
    if (!firstOption) throw new Error('List option not found');
    fireEvent.click(firstOption);
    await waitFor(() => expect(listbox).toHaveAttribute('aria-activedescendant', 'run-event-option-event-1'));

    const toolsFilter = getByRole('button', { name: 'Tools' });
    fireEvent.click(toolsFilter);

    await waitFor(() => expect(listbox.getAttribute('aria-activedescendant')).toBeNull());
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    await waitFor(() => expect(getByTestId('location').textContent).not.toContain('eventId='));
  });

  it('supports toggling follow with the "f" keyboard shortcut', async () => {
    const { getByRole, getByTestId, getByText } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const toggle = getByRole('switch', { name: 'Follow latest events' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    fireEvent.keyDown(window, { key: 'f' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=false'));
    expect(getByText('Manual')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'f' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(getByTestId('location').textContent).toContain('follow=true'));
    expect(getByText('Following')).toBeInTheDocument();
  });
});

describe('AgentsRunTimeline terminate control', () => {
  it('renders terminate button for running runs and triggers termination flow', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-10',
    ]);

    const terminateButton = getByRole('button', { name: 'Terminate' });
    await act(async () => {
      fireEvent.click(terminateButton);
    });

    await waitFor(() => expect(runsModule.terminate).toHaveBeenCalledWith('run-1'));
    expect(confirmSpy).toHaveBeenCalledWith('Terminate this run? This will attempt to stop the active run.');
    expect(notifyMocks.success).toHaveBeenCalledWith('Termination signaled');
    expect(notifyMocks.error).not.toHaveBeenCalled();
    await waitFor(() => expect(terminateButton).not.toBeDisabled());
    expect(summaryRefetch).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('hides terminate button when run is not running', () => {
    const events = [buildEvent()];
    const nonRunningSummary = { ...buildSummary(events), status: 'success' as RunEventStatus };

    summaryMock.mockReset();
    summaryMock.mockReturnValue({
      data: nonRunningSummary,
      isLoading: false,
      isError: false,
      error: null,
      refetch: summaryRefetch,
    });

    eventsQueryState = {
      data: { items: events, nextCursor: null },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };
    eventsMock.mockImplementation(() => eventsQueryState);

    const { queryByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    expect(queryByRole('button', { name: 'Terminate' })).toBeNull();
    expect(runsModule.terminate).not.toHaveBeenCalled();
  });
});

describe('AgentsRunTimeline pagination and scrolling', () => {
  it('auto-scrolls to bottom on initial load', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-2',
    ]);

    expect(eventsMock).toHaveBeenCalledWith('run-1', expect.objectContaining({ limit: 100, order: 'desc' }));

    const listbox = getByRole('listbox');
    let scrollTop = 0;
    const scrollHeight = 480;
    Object.defineProperty(listbox, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    while (rafCallbacks.length) {
      const cb = rafCallbacks.shift();
      cb?.(0);
    }

    await waitFor(() => expect(scrollTop).toBe(scrollHeight));

    rafSpy.mockRestore();
  });

  it('loads older events while preserving viewport, order, and history marker', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
      }),
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

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { getByRole, queryByRole, getByText } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    const perItem = 100;
    const baseHeight = 200;
    let scrollTop = 0;
    Object.defineProperty(listbox, 'scrollHeight', {
      configurable: true,
      get: () => baseHeight + listbox.querySelectorAll('[role="option"]').length * perItem,
    });
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    while (rafCallbacks.length) {
      const cb = rafCallbacks.shift();
      cb?.(0);
    }

    await waitFor(() => expect(scrollTop).toBe(baseHeight + initialEvents.length * perItem));

    const button = getByRole('button', { name: 'Load older events' });
    expect(button).toBeInTheDocument();

    const previousScrollTop = 140;
    scrollTop = previousScrollTop;

    const olderEvent = buildEvent({
      id: 'event-0',
      ts: '2023-12-31T23:59:58.000Z',
      type: 'injection',
      toolExecution: undefined,
      injection: { messageIds: [], reason: 'test' },
    });

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [olderEvent],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(runsModule.timelineEvents).toHaveBeenCalledWith('run-1', expect.objectContaining({
      types: undefined,
      statuses: undefined,
      order: 'desc',
      limit: 100,
      cursorTs: olderCursor.ts,
      cursorId: olderCursor.id,
      cursorParamMode: 'both',
    }));

    await waitFor(() => {
      const expected = previousScrollTop + perItem;
      expect(Math.round(scrollTop)).toBe(expected);
    });

    const options = within(listbox).getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'run-event-option-event-0');
    expect(options[1]).toHaveAttribute('id', 'run-event-option-event-1');
    expect(options[2]).toHaveAttribute('id', 'run-event-option-event-2');
    expect(getByText('Beginning of timeline')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Load older events' })).toBeNull();

    rafSpy.mockRestore();
  });

  it('shows an error message when loading older events fails', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    eventsQueryState = {
      data: { items: [buildEvent()], nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { getByRole, findByText } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    let scrollTop = 0;
    Object.defineProperty(listbox, 'scrollHeight', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    while (rafCallbacks.length) {
      const cb = rafCallbacks.shift();
      cb?.(0);
    }

    const button = getByRole('button', { name: 'Load older events' });

    runsModule.timelineEvents.mockRejectedValueOnce(new Error('load failed'));

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    await findByText('load failed');
    expect(button).not.toBeDisabled();

    rafSpy.mockRestore();
  });
});

describe('AgentsRunTimeline filter refetch reconciliation', () => {
  it('preserves realtime events received during filter refresh', async () => {
    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
        status: 'success',
        type: 'tool_execution',
        toolExecution: {
          toolName: 'Search Tool',
          toolCallId: 'call-1',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:02.000Z',
        status: 'success',
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

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: null },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    summaryMock.mockReturnValue({
      data: buildSummary(initialEvents),
      isLoading: false,
      isError: false,
      error: null,
      refetch: summaryRefetch,
    });

    const { getByRole, findByText } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await findByText('Tool Execution — Search Tool');

    const successFilter = getByRole('button', { name: 'success' });

    eventsQueryState = {
      data: { items: [], nextCursor: null },
      isFetching: true,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    await act(async () => {
      fireEvent.click(successFilter);
    });

    const realtimeEvent = buildEvent({
      id: 'event-3',
      ts: '2024-01-01T00:00:03.000Z',
      status: 'success',
      type: 'tool_execution',
      toolExecution: {
        toolName: 'Realtime Tool',
        toolCallId: 'call-rt',
        execStatus: 'success',
        input: { query: 'status' },
        output: { result: 'ok' },
        errorMessage: null,
        raw: null,
      },
    });

    await act(async () => {
      socketMocks.runEvent?.({ runId: 'run-1', event: realtimeEvent, mutation: 'append' });
    });

    await findByText('Tool Execution — Realtime Tool');

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: null },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const updatedEvent = buildEvent({
      id: 'event-1',
      ts: '2024-01-01T00:00:00.000Z',
      status: 'success',
      type: 'tool_execution',
      toolExecution: {
        toolName: 'Search Tool',
        toolCallId: 'call-1',
        execStatus: 'success',
        input: { query: 'update' },
        output: { result: 'ok' },
        errorMessage: null,
        raw: null,
      },
    });

    await act(async () => {
      socketMocks.runEvent?.({ runId: 'run-1', event: updatedEvent, mutation: 'update' });
    });

    const options = within(listbox).getAllByRole('option');
    const optionIds = options.map((node) => node.getAttribute('id'));
    expect(optionIds).toContain('run-event-option-event-3');
    expect(within(listbox).getByText('Tool Execution — Realtime Tool')).toBeInTheDocument();
  });
});

describe('AgentsRunTimeline load older resilience', () => {
  it('retains prepended history when base query emits the latest cursor again', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
      }),
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

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole, findByText, queryByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await findByText('Tool Execution — Search Tool');

    const button = getByRole('button', { name: 'Load older events' });

    const olderEvent = buildEvent({
      id: 'event-0',
      ts: '2023-12-31T23:59:58.000Z',
      type: 'summarization',
      summarization: {
        summaryText: 'legacy',
        newContextCount: 0,
        oldContextTokens: null,
        raw: null,
      },
    });

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [olderEvent],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    await findByText('Summarization');
    expect(queryByRole('button', { name: 'Load older events' })).toBeNull();

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    await act(async () => {
      socketMocks.runEvent?.({
        runId: 'run-1',
        event: buildEvent({ id: 'event-1', status: 'success' }),
        mutation: 'update',
      });
    });

    expect(queryByRole('button', { name: 'Load older events' })).toBeNull();
    const options = within(listbox).getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'run-event-option-event-0');
    expect(options[options.length - 1]).toHaveAttribute('id', 'run-event-option-event-2');
  });
});

describe('AgentsRunTimeline load older regressions', () => {
  it('Case A: prepends older events in ascending order', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-9',
        ts: '2024-01-01T00:00:09.000Z',
      }),
      buildEvent({
        id: 'event-10',
        ts: '2024-01-01T00:00:10.000Z',
        toolExecution: {
          toolName: 'Latest tool',
          toolCallId: 'call-latest',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline?eventId=event-3',
    ]);

    const listbox = getByRole('listbox');
    await within(listbox).findByText('Tool Execution — Latest tool');

    const initialOptions = within(listbox).getAllByRole('option');
    expect(initialOptions).toHaveLength(2);
    expect(initialOptions[0]).toHaveAttribute('id', 'run-event-option-event-9');
    expect(initialOptions[1]).toHaveAttribute('id', 'run-event-option-event-10');

    const button = getByRole('button', { name: 'Load older events' });

    const olderEvent = buildEvent({
      id: 'event-8',
      ts: '2023-12-31T23:59:58.000Z',
      type: 'summarization',
      summarization: {
        summaryText: 'Older summary',
        newContextCount: 0,
        oldContextTokens: null,
        raw: null,
      },
    });

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [olderEvent],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    await within(listbox).findByText('Summarization');

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(initialOptions.length + 1);
    expect(options.map((option) => option.getAttribute('id'))).toEqual([
      'run-event-option-event-8',
      'run-event-option-event-9',
      'run-event-option-event-10',
    ]);
    expect(within(listbox).getByText('Summarization')).toBeInTheDocument();
  });

  it('Case B: prepends older events when success status filter is active', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
        status: 'pending',
        toolExecution: {
          toolName: 'Pending tool',
          toolCallId: 'call-1',
          execStatus: 'pending',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:02.000Z',
        status: 'success',
        toolExecution: {
          toolName: 'Success tool',
          toolCallId: 'call-2',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await within(listbox).findByText('Tool Execution — Success tool');

    const successFilter = getByRole('button', { name: 'success' });

    await act(async () => {
      fireEvent.click(successFilter);
    });

    await waitFor(() => {
      const filtered = within(listbox).getAllByRole('option');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toHaveAttribute('id', 'run-event-option-event-2');
    });

    const button = getByRole('button', { name: 'Load older events' });

    const olderEvent = buildEvent({
      id: 'event-0',
      ts: '2023-12-31T23:59:58.000Z',
      status: 'success',
      toolExecution: {
        toolName: 'Older success tool',
        toolCallId: 'call-0',
        execStatus: 'success',
        input: {},
        output: {},
        errorMessage: null,
        raw: null,
      },
    });

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [olderEvent],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    await within(listbox).findByText('Tool Execution — Older success tool');

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('id', 'run-event-option-event-0');
    expect(options[1]).toHaveAttribute('id', 'run-event-option-event-2');
  });

  it('Case C: honors latest filters during in-flight load older resolution', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
        type: 'summarization',
        summarization: {
          summaryText: 'summary',
          newContextCount: 0,
          oldContextTokens: null,
          raw: null,
        },
      }),
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:01.000Z',
        toolExecution: {
          toolName: 'Tool after summary',
          toolCallId: 'call-2',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await within(listbox).findByText('Summarization');

    const toggleMessages = getByRole('button', { name: 'Messages' });
    const toggleLLM = getByRole('button', { name: 'LLM' });
    const toggleTools = getByRole('button', { name: 'Tools' });
    const toggleInjected = getByRole('button', { name: 'Injected' });
    const toggleSummaries = getByRole('button', { name: 'Summaries' });

    await act(async () => {
      fireEvent.click(toggleMessages);
      fireEvent.click(toggleLLM);
      fireEvent.click(toggleTools);
      fireEvent.click(toggleInjected);
    });

    await waitFor(() => {
      expect(within(listbox).queryByText('Tool Execution — Tool after summary')).not.toBeInTheDocument();
      expect(within(listbox).getByText('Summarization')).toBeInTheDocument();
    });

    const deferred = createDeferred<{ items: RunTimelineEvent[]; nextCursor: RunTimelineEventsCursor | null }>();
    runsModule.timelineEvents.mockReturnValueOnce(deferred.promise);

    const button = getByRole('button', { name: 'Load older events' });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(runsModule.timelineEvents).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(toggleTools);
      fireEvent.click(toggleSummaries);
    });

    const matchingOlderEvent = buildEvent({
      id: 'event-0',
      ts: '2023-12-31T23:59:58.000Z',
      toolExecution: {
        toolName: 'Older tool',
        toolCallId: 'call-0',
        execStatus: 'success',
        input: {},
        output: {},
        errorMessage: null,
        raw: null,
      },
    });

    await act(async () => {
      deferred.resolve({
        items: [matchingOlderEvent],
        nextCursor: null,
      });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(within(listbox).getByText('Tool Execution — Older tool')).toBeInTheDocument();
    });
  });

  it('Case D: retains older history after reconnect-triggered refetch fallback', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
      }),
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:02.000Z',
        toolExecution: {
          toolName: 'Latest tool',
          toolCallId: 'call-2',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await within(listbox).findByText('Tool Execution — Latest tool');

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [
        buildEvent({
          id: 'event-0',
          ts: '2023-12-31T23:59:58.000Z',
          type: 'summarization',
          summarization: {
            summaryText: 'Older summary',
            newContextCount: 0,
            oldContextTokens: null,
            raw: null,
          },
        }),
      ],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Load older events' }));
      await Promise.resolve();
    });

    expect(within(listbox).getByText('Summarization')).toBeInTheDocument();

    runsModule.timelineEvents.mockRejectedValueOnce(new Error('network'));
    eventsRefetch.mockImplementation(async () => {
      eventsQueryState = {
        ...eventsQueryState,
        data: { items: initialEvents, nextCursor: olderCursor },
      };
    });

    await act(async () => {
      socketMocks.reconnect?.();
      await Promise.resolve();
    });

    const options = within(listbox).getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'run-event-option-event-0');
    expect(options[options.length - 1]).toHaveAttribute('id', 'run-event-option-event-2');
  });

  it('Case E: includes cursor, limit, order, and filters in load older call', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-1',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-1',
        ts: '2024-01-01T00:00:00.000Z',
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const typeButtons = {
      messages: getByRole('button', { name: 'Messages' }),
      llm: getByRole('button', { name: 'LLM' }),
      summaries: getByRole('button', { name: 'Summaries' }),
      injected: getByRole('button', { name: 'Injected' }),
    };
    const statusSuccess = getByRole('button', { name: 'success' });

    await act(async () => {
      fireEvent.click(typeButtons.messages);
      fireEvent.click(typeButtons.llm);
      fireEvent.click(typeButtons.summaries);
      fireEvent.click(typeButtons.injected);
      fireEvent.click(statusSuccess);
    });

    runsModule.timelineEvents.mockResolvedValueOnce({ items: [], nextCursor: null });

    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Load older events' }));
      await Promise.resolve();
    });

    expect(runsModule.timelineEvents).toHaveBeenCalledTimes(1);
    const [, params] = runsModule.timelineEvents.mock.calls[0];
    expect(params).toMatchObject({
      cursorTs: olderCursor.ts,
      cursorId: olderCursor.id,
      order: 'desc',
      limit: 100,
      types: 'tool_execution',
      statuses: 'success',
      cursorParamMode: 'both',
    });
  });

  it('Overwrites older items on refetch (before fix) and preserves after fix', async () => {
    const olderCursor: RunTimelineEventsCursor = {
      id: 'cursor-older',
      ts: '2023-12-31T23:59:59.000Z',
    };

    const initialEvents = [
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:02.000Z',
        toolExecution: {
          toolName: 'Recent tool',
          toolCallId: 'call-recent',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
      buildEvent({
        id: 'event-3',
        ts: '2024-01-01T00:00:03.000Z',
        toolExecution: {
          toolName: 'Latest tool',
          toolCallId: 'call-latest',
          execStatus: 'success',
          input: {},
          output: {},
          errorMessage: null,
          raw: null,
        },
      }),
    ];

    eventsQueryState = {
      data: { items: initialEvents, nextCursor: olderCursor },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    };

    const { getByRole } = renderPage([
      '/agents/threads/thread-1/runs/run-1/timeline',
    ]);

    const listbox = getByRole('listbox');
    await within(listbox).findByText('Tool Execution — Latest tool');

    const button = getByRole('button', { name: 'Load older events' });

    const olderEvent = buildEvent({
      id: 'event-1',
      ts: '2023-12-31T23:59:58.000Z',
      toolExecution: {
        toolName: 'Oldest tool',
        toolCallId: 'call-oldest',
        execStatus: 'success',
        input: {},
        output: {},
        errorMessage: null,
        raw: null,
      },
    });

    runsModule.timelineEvents.mockResolvedValueOnce({
      items: [olderEvent],
      nextCursor: null,
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    await within(listbox).findByText('Tool Execution — Oldest tool');

    const afterLoad = within(listbox).getAllByRole('option');
    expect(afterLoad).toHaveLength(3);
    expect(afterLoad[0]).toHaveAttribute('id', 'run-event-option-event-1');
    expect(afterLoad[afterLoad.length - 1]).toHaveAttribute('id', 'run-event-option-event-3');

    eventsRefetch.mockImplementation(async () => {
      eventsQueryState = {
        data: { items: initialEvents, nextCursor: olderCursor },
        isFetching: false,
        isError: false,
        error: null,
        refetch: eventsRefetch,
      };
    });

    const refreshButton = getByRole('button', { name: 'Refresh' });

    await act(async () => {
      fireEvent.click(refreshButton);
      await Promise.resolve();
    });

    const afterRefetch = within(listbox).getAllByRole('option');
    expect(afterRefetch).toHaveLength(3);
    expect(afterRefetch[0]).toHaveAttribute('id', 'run-event-option-event-1');
    expect(afterRefetch[afterRefetch.length - 1]).toHaveAttribute('id', 'run-event-option-event-3');
  });
});
