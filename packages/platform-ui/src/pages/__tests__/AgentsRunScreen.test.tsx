import React from 'react';
import { describe, expect, beforeEach, afterEach, vi, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';

import type { RunTimelineEvent, RunTimelineSummary, RunTimelineEventsResponse } from '@/api/types/agents';
import { AgentsRunScreen } from '../AgentsRunScreen';

vi.mock('@/components/screens/RunScreen', async () => {
  type EventFilter = 'message' | 'llm' | 'tool' | 'summary';
  type StatusFilter = 'running' | 'finished' | 'failed' | 'terminated';

  const renderSpy = vi.fn();

  const MockRunScreen = (props: any) => {
    renderSpy(props);
    return (
      <div data-testid="run-screen-mock">
        <button type="button" data-testid="select-first" onClick={() => props.onSelectEvent?.(props.events?.[0]?.id ?? 'event-1')}>
          select
        </button>
        <button type="button" data-testid="apply-event-filter" onClick={() => props.onEventFiltersChange?.(['message'] satisfies EventFilter[])}>
          event-filter
        </button>
        <button type="button" data-testid="apply-status-filter" onClick={() => props.onStatusFiltersChange?.(['running'] satisfies StatusFilter[])}>
          status-filter
        </button>
        <button type="button" data-testid="load-more" onClick={() => props.onLoadMoreEvents?.()}>
          load-more
        </button>
        <button type="button" data-testid="clear-selection" onClick={() => props.onClearSelection?.()}>
          clear-selection
        </button>
        <button type="button" data-testid="terminate" onClick={() => props.onTerminate?.()}>
          terminate
        </button>
      </div>
    );
  };

  return {
    __esModule: true,
    default: MockRunScreen,
    runScreenRenderSpy: renderSpy,
  };
});

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineEvents: vi.fn(),
  useRunTimelineSummary: vi.fn(),
}));

vi.mock('@/api/modules/runs', () => ({
  runs: {
    timelineEvents: vi.fn(),
    terminate: vi.fn(),
  },
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    setRunCursor: vi.fn(),
    getRunCursor: vi.fn(() => null),
    onRunEvent: vi.fn(() => () => {}),
    onRunStatusChanged: vi.fn(() => () => {}),
    onReconnected: vi.fn(() => () => {}),
  },
}));

vi.mock('@/lib/notify', () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

import { runScreenRenderSpy } from '@/components/screens/RunScreen';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { runs as runsModule } from '@/api/modules/runs';
import { graphSocket } from '@/lib/graph/socket';
import { notifyError, notifySuccess } from '@/lib/notify';

function buildEvent(partial: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  return {
    id: partial.id ?? `event-${Math.random().toString(36).slice(2)}`,
    runId: partial.runId ?? 'run-1',
    type: partial.type ?? 'invocation_message',
    status: partial.status ?? 'success',
    ts: partial.ts ?? '2024-01-01T00:00:00.000Z',
    durationMs: partial.durationMs ?? 1,
    message: partial.message,
    injection: partial.injection,
    summarization: partial.summarization,
    llmCall: partial.llmCall,
    toolExecution: partial.toolExecution,
    actorId: partial.actorId ?? 'actor-1',
  };
}

function renderScreen(initialPath = '/agents/threads/thread-1/runs/run-1') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/agents/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});

describe('AgentsRunScreen', () => {
  const useRunTimelineEventsMock = vi.mocked(useRunTimelineEvents);
  const useRunTimelineSummaryMock = vi.mocked(useRunTimelineSummary);
  const runsModuleMock = vi.mocked(runsModule);
  const graphSocketMock = vi.mocked(graphSocket);
  const notifyErrorMock = vi.mocked(notifyError);
  const notifySuccessMock = vi.mocked(notifySuccess);
  let summaryHookValue: { data: RunTimelineSummary; isLoading: boolean; refetch: ReturnType<typeof vi.fn> };
  let runEventListener: ((payload: { runId: string; event: RunTimelineEvent }) => void) | null;

  beforeEach(() => {
    localStorage.clear();
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    matchMediaMock.mockClear();
    runScreenRenderSpy.mockClear();
    runsModuleMock.timelineEvents.mockReset();
    runsModuleMock.terminate.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessMock.mockReset();
    graphSocketMock.subscribe.mockReset();
    graphSocketMock.unsubscribe.mockReset();
    graphSocketMock.setRunCursor.mockReset();
    graphSocketMock.getRunCursor.mockReturnValue(null);
    runEventListener = null;
    graphSocketMock.onRunEvent.mockImplementation((handler) => {
      runEventListener = handler;
      return () => {};
    });
    graphSocketMock.onRunStatusChanged.mockReturnValue(() => {});
    graphSocketMock.onReconnected.mockReturnValue(() => {});

    summaryHookValue = {
      data: {
        id: 'run-1',
        status: 'running',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:01.000Z',
        firstEventAt: '2024-01-01T00:00:00.000Z',
        lastEventAt: '2024-01-01T00:00:01.000Z',
        totalEvents: 2,
        countsByType: {
          invocation_message: 1,
          injection: 0,
          llm_call: 1,
          tool_execution: 0,
          summarization: 0,
        },
        countsByStatus: {
          pending: 0,
          running: 1,
          success: 1,
          error: 0,
          cancelled: 0,
        },
      } as RunTimelineSummary,
      isLoading: false,
      refetch: vi.fn(),
    };
    useRunTimelineSummaryMock.mockReturnValue(summaryHookValue);

    const eventsResponse = {
      items: [
        buildEvent({ id: 'event-1', ts: '2024-01-01T00:00:00.000Z' }),
        buildEvent({ id: 'event-2', ts: '2024-01-01T00:00:01.000Z' }),
      ],
      nextCursor: { ts: '2023-12-31T23:59:59.000Z', id: 'cursor-1' },
    } satisfies RunTimelineEventsResponse;

    useRunTimelineEventsMock.mockReturnValue({
      data: eventsResponse,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('selects the latest event when following', async () => {
    renderScreen();

    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());
    const latestProps = runScreenRenderSpy.mock.calls.at(-1)?.[0];
    expect(latestProps?.selectedEventId).toBe('event-2');
    expect(latestProps?.isFollowing).toBe(true);
  });

  it('builds API filters when filters change', async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    const initialCall = useRunTimelineEventsMock.mock.calls.at(-1);
    expect(initialCall?.[1]?.types).toEqual([]);
    expect(initialCall?.[1]?.statuses).toEqual([]);

    getByTestId('apply-event-filter').click();
    getByTestId('apply-status-filter').click();

    await waitFor(() => {
      const lastCall = useRunTimelineEventsMock.mock.calls.at(-1);
      expect(lastCall?.[1]?.statuses).toEqual(['pending', 'running']);
    });
  });

  it('loads older events via the runs module', async () => {
    runsModuleMock.timelineEvents.mockResolvedValue({
      items: [buildEvent({ id: 'older', ts: '2023-12-31T23:59:58.000Z' })],
      nextCursor: null,
    });

    const { getByTestId } = renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    getByTestId('load-more').click();

    await waitFor(() => expect(runsModuleMock.timelineEvents).toHaveBeenCalledTimes(1));
    const call = runsModuleMock.timelineEvents.mock.calls[0];
    expect(call?.[0]).toBe('run-1');
    expect(call?.[1]).toMatchObject({ limit: 100, order: 'desc' });
  });

  it('surfaces load-older errors without clearing the timeline', async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    runsModuleMock.timelineEvents.mockRejectedValueOnce(new Error('load failure'));

    getByTestId('load-more').click();

    await waitFor(() => {
      const latestProps = runScreenRenderSpy.mock.calls.at(-1)?.[0];
      expect(latestProps?.error).toBeUndefined();
      expect(latestProps?.listErrorMessage).toContain('load failure');
    });
  });

  it('updates selection state immediately when selecting an event', async () => {
    renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    const initialProps = runScreenRenderSpy.mock.calls.at(-1)?.[0];
    expect(initialProps?.selectedEventId).toBe('event-2');

    initialProps?.onSelectEvent?.('event-1');

    await waitFor(() => {
      const latestProps = runScreenRenderSpy.mock.calls.at(-1)?.[0];
      expect(latestProps?.selectedEventId).toBe('event-1');
    });
  });

  it('advances the graph socket cursor when new events arrive', async () => {
    renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());
    expect(runEventListener).toBeTruthy();

    const initialCalls = graphSocketMock.setRunCursor.mock.calls.length;
    const incoming = buildEvent({ id: 'event-3', ts: '2024-01-01T00:00:02.000Z' });
    runEventListener?.({ runId: 'run-1', event: incoming });

    await waitFor(() => {
      expect(graphSocketMock.setRunCursor.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    const newCalls = graphSocketMock.setRunCursor.mock.calls.slice(initialCalls);
    const firstNewCall = newCalls[0];
    expect(firstNewCall?.[0]).toBe('run-1');
    expect(firstNewCall?.[1]).toEqual({ ts: incoming.ts, id: incoming.id });
  });

  it('terminates the run successfully', async () => {
    runsModuleMock.terminate.mockResolvedValue(undefined);
    const summaryRefetch = vi.fn();
    summaryHookValue.refetch = summaryRefetch;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    getByTestId('terminate').click();

    await waitFor(() => expect(runsModuleMock.terminate).toHaveBeenCalledWith('run-1'));
    expect(summaryRefetch).toHaveBeenCalled();
    expect(notifySuccessMock).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('emits error notification when termination fails', async () => {
    runsModuleMock.terminate.mockRejectedValue(new Error('fail'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { getByTestId } = renderScreen();
    await waitFor(() => expect(runScreenRenderSpy).toHaveBeenCalled());

    getByTestId('terminate').click();

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });
});
