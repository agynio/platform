import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RunTimelineEvent, RunTimelineSummary, RunEventStatus, RunEventType, RunTimelineEventsCursor } from '@/api/types/agents';
import type * as ConfigModule from '@/config';
import { graphSocket } from '@/lib/graph/socket';
import { createSocketTestServer, type TestSocketServer } from '../../../__tests__/socketServer.helper';

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
const eventsMock = vi.fn<MockedEventsResult, [string | undefined, { types: string[]; statuses: string[] }]>();

const runsModule = vi.hoisted(() => ({
  timelineEvents: vi.fn(),
  terminate: vi.fn(),
}));

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => summaryMock(runId),
  useRunTimelineEvents: (runId: string | undefined, filters: { types: string[]; statuses: string[] }) =>
    eventsMock(runId, filters),
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

import { AgentsRunTimeline } from '../AgentsRunTimeline';

const THREAD_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const RUN_APPEND_ID = '33333333-3333-3333-3333-333333333333';

let socketServer: TestSocketServer;

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  return {
    id: 'event-1',
    runId: RUN_ID,
    threadId: THREAD_ID,
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
    runId: RUN_ID,
    threadId: THREAD_ID,
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
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function waitForRunSubscription(runId: string) {
  await socketServer.waitForRoom(`run:${runId}`);
}

beforeAll(async () => {
  socketServer = await createSocketTestServer();
  socketBaseUrl = socketServer.baseUrl;
});

beforeEach(() => {
  summaryRefetch.mockClear();
  eventsRefetch.mockClear();
  runsModule.timelineEvents.mockReset();
  runsModule.terminate.mockReset();
  summaryMock.mockReset();
  eventsMock.mockReset();
  notifyMocks.success.mockReset();
  notifyMocks.error.mockReset();
  setMatchMedia(true);

  runsModule.terminate.mockResolvedValue({ ok: true });
  graphSocket.setRunCursor(RUN_ID, null, { force: true });
  graphSocket.setRunCursor(RUN_APPEND_ID, null, { force: true });

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
    data: { items: events, nextCursor: null },
    isFetching: false,
    isError: false,
    error: null,
    refetch: eventsRefetch,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await socketServer.close();
});

describe('AgentsRunTimeline layout and selection', () => {
  it('renders list/detail columns, honors URL selection, and supports keyboard navigation', async () => {
    const { getByRole, getByText, getByTestId } = renderPage([
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}?eventId=event-2`,
    ]);

    await waitForRunSubscription(RUN_ID);

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
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}`,
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
  it('replaces existing events on update and displays refreshed tool output', async () => {
    const { getByRole, getByTestId } = renderPage([
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}?eventId=event-1`,
    ]);

    await waitForRunSubscription(RUN_ID);

    const listbox = getByRole('listbox');
    const option = within(listbox).getByText('Tool Execution — Search Tool').closest('[role="option"]');
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
      socketServer.emitRunEvent(RUN_ID, THREAD_ID, { runId: RUN_ID, event: updated, mutation: 'update' });
    });

    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(option).getByText('error')).toBeInTheDocument());
    expect(graphSocket.getRunCursor(RUN_ID)).toEqual({ ts: updated.ts, id: updated.id });

    const details = getByTestId('timeline-event-details');
    expect(details).toHaveTextContent('Tool Execution — Search Tool');
    expect(details).toHaveTextContent('error');
    expect(details).toHaveTextContent('"answer": 42');
    expect(details).toHaveTextContent('Error: Tool exploded');
  });

  it('merges socket updates and performs cursor catch-up after reconnect', async () => {
    const { findByText, getByTestId, unmount } = renderPage([
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}?eventId=event-1`,
    ]);

    await waitForRunSubscription(RUN_ID);

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
      socketServer.emitRunEvent(RUN_ID, THREAD_ID, { runId: RUN_ID, event: appended, mutation: 'append' });
    });

    await findByText('Summarization');
    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    expect(graphSocket.getRunCursor(RUN_ID)).toEqual({ ts: appended.ts, id: appended.id });

    await act(async () => {
      socketServer.emitRunStatusChanged(THREAD_ID, {
        id: RUN_ID,
        status: 'finished',
        createdAt: appended.ts,
        updatedAt: '2024-01-01T00:00:04.000Z',
      });
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

    const socket = graphSocket.connect();
    await act(async () => {
      socket.io.emit('reconnect');
      await Promise.resolve();
    });

    await waitFor(() => expect(runsModule.timelineEvents).toHaveBeenCalledTimes(1));
    expect(runsModule.timelineEvents).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({
      types: undefined,
      cursorTs: appended.ts,
      cursorId: appended.id,
    }));
    expect(summaryRefetch).toHaveBeenCalledTimes(3);
    expect(eventsRefetch).not.toHaveBeenCalled();
    await findByText('Tool Execution — Weather');

    expect(getByTestId('timeline-event-details')).toBeInTheDocument();
    unmount();
  });
});

describe('AgentsRunTimeline terminate control', () => {
  it('renders terminate button for running runs and triggers termination flow', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { getByRole } = renderPage([
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}`,
    ]);

    await waitForRunSubscription(RUN_ID);

    const terminateButton = getByRole('button', { name: 'Terminate' });
    await act(async () => {
      fireEvent.click(terminateButton);
    });

    await waitFor(() => expect(runsModule.terminate).toHaveBeenCalledWith(RUN_ID));
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

    eventsMock.mockReset();
    eventsMock.mockReturnValue({
      data: { items: events, nextCursor: null },
      isFetching: false,
      isError: false,
      error: null,
      refetch: eventsRefetch,
    });

    const { queryByRole } = renderPage([
      `/agents/threads/${THREAD_ID}/runs/${RUN_ID}`,
    ]);

    expect(queryByRole('button', { name: 'Terminate' })).toBeNull();
    expect(runsModule.terminate).not.toHaveBeenCalled();
  });
});
