import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RunTimelineEventListItem } from '@/components/agents/RunTimelineEventListItem';
import { RunTimelineEventDetails } from '@/components/agents/RunTimelineEventDetails';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { runs } from '@/api/modules/runs';
import { graphSocket } from '@/lib/graph/socket';
import type { RunEventStatus, RunEventType, RunTimelineEvent, RunTimelineEventsCursor, RunTimelineEventsResponse } from '@/api/types/agents';
import { getEventTypeLabel } from '@/components/agents/runTimelineFormatting';
import { notifyError, notifySuccess } from '@/lib/notify';

const EVENT_TYPES: RunEventType[] = ['invocation_message', 'injection', 'llm_call', 'tool_execution', 'summarization'];
const STATUS_TYPES: RunEventStatus[] = ['pending', 'running', 'success', 'error', 'cancelled'];

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareEvents(a: RunTimelineEvent, b: RunTimelineEvent): number {
  const timeDiff = parseTimestamp(a.ts) - parseTimestamp(b.ts);
  if (timeDiff !== 0) return timeDiff;
  const lexical = a.ts.localeCompare(b.ts);
  if (lexical !== 0) return lexical;
  return a.id.localeCompare(b.id);
}

function sortEvents(events: RunTimelineEvent[]): RunTimelineEvent[] {
  if (events.length <= 1) return events.slice();
  return [...events].sort(compareEvents);
}

function matchesFilters(event: RunTimelineEvent, types: RunEventType[], statuses: RunEventStatus[]): boolean {
  const typeOk = types.length === 0 || types.includes(event.type);
  const statusOk = statuses.length === 0 || statuses.includes(event.status);
  return typeOk && statusOk;
}

type EventBoundary = { id: string; ts: string };

type MergeStats = {
  incomingLength: number;
  prevLength: number;
  nextLength: number;
  included: number;
  replaced: number;
  removed: number;
  deduped: number;
  filtered: number;
  first?: EventBoundary | null;
  last?: EventBoundary | null;
};

type MergeContextSource =
  | 'base-query'
  | 'load-older'
  | 'socket-event'
  | 'catch-up'
  | 'initial';

type MergeContext = {
  source: MergeContextSource | string;
  runId?: string;
  filters?: { types: RunEventType[]; statuses: RunEventStatus[] };
  cursor?: RunTimelineEventsCursor | null;
  mode?: 'MERGE' | 'REPLACE';
};

type MergeOptions = {
  context?: MergeContext;
  captureStats?: (stats: MergeStats) => void;
};

function summarizeEventBoundary(event: RunTimelineEvent | undefined): EventBoundary | null {
  if (!event) return null;
  return { id: event.id, ts: event.ts };
}

function mergeEvents(
  prev: RunTimelineEvent[],
  incoming: RunTimelineEvent[],
  types: RunEventType[],
  statuses: RunEventStatus[],
  options?: MergeOptions,
): RunTimelineEvent[] {
  const prevLength = prev.length;
  if (incoming.length === 0) {
    const stats: MergeStats = {
      incomingLength: 0,
      prevLength,
      nextLength: prevLength,
      included: 0,
      replaced: 0,
      removed: 0,
      deduped: 0,
      filtered: 0,
      first: summarizeEventBoundary(prev[0]),
      last: summarizeEventBoundary(prev[prevLength - 1]),
    };
    options?.captureStats?.(stats);
    return prev;
  }

  const next = [...prev];
  let included = 0;
  let replaced = 0;
  let removed = 0;
  let deduped = 0;
  let filtered = 0;

  for (const event of incoming) {
    const idx = next.findIndex((existing) => existing.id === event.id);
    const include = matchesFilters(event, types, statuses);
    if (idx >= 0) {
      if (include) {
        const existing = next[idx];
        const existingSerialized = existing ? JSON.stringify(existing) : null;
        const incomingSerialized = JSON.stringify(event);
        if (existingSerialized === incomingSerialized) {
          deduped += 1;
        } else {
          replaced += 1;
        }
        next[idx] = event;
      } else {
        removed += 1;
        next.splice(idx, 1);
      }
    } else if (include) {
      included += 1;
      next.push(event);
    } else {
      filtered += 1;
    }
  }

  const sorted = sortEvents(next);
  const stats: MergeStats = {
    incomingLength: incoming.length,
    prevLength,
    nextLength: sorted.length,
    included,
    replaced,
    removed,
    deduped,
    filtered,
    first: summarizeEventBoundary(sorted[0]),
    last: summarizeEventBoundary(sorted[sorted.length - 1]),
  };
  options?.captureStats?.(stats);
  return sorted;
}

function compareCursors(a: RunTimelineEventsCursor, b: RunTimelineEventsCursor): number {
  const timeDiff = parseTimestamp(a.ts) - parseTimestamp(b.ts);
  if (timeDiff !== 0) return timeDiff;
  const lexical = a.ts.localeCompare(b.ts);
  if (lexical !== 0) return lexical;
  return a.id.localeCompare(b.id);
}

type CursorParamMode = 'both' | 'plain' | 'bracketed';

function buildCursorAttemptModes(preferred: CursorParamMode): CursorParamMode[] {
  if (preferred === 'both') return ['both', 'plain'];
  const fallback = preferred === 'plain' ? 'bracketed' : 'plain';
  return [preferred, fallback];
}

function isNonAdvancingPage(response: RunTimelineEventsResponse, cursor: RunTimelineEventsCursor): boolean {
  const items = response.items ?? [];
  const lastMatches = items.length > 0 && compareCursors(toCursor(items[items.length - 1]), cursor) === 0;
  const nextMatches = response.nextCursor ? compareCursors(response.nextCursor, cursor) === 0 : false;
  return lastMatches || nextMatches;
}

function toCursor(event: RunTimelineEvent): RunTimelineEventsCursor {
  return { ts: event.ts, id: event.id };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

export function AgentsRunTimeline() {
  const params = useParams<{ threadId: string; runId: string }>();
  const threadId = params.threadId;
  const runId = params.runId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedTypes, setSelectedTypes] = useState<RunEventType[]>(EVENT_TYPES);
  const [selectedStatuses, setSelectedStatuses] = useState<RunEventStatus[]>([]);
  const [isTerminating, setIsTerminating] = useState(false);

  useEffect(() => {
    setSelectedTypes(EVENT_TYPES);
    setSelectedStatuses([]);
  }, [runId]);

  const apiTypes = useMemo(
    () => (selectedTypes.length === EVENT_TYPES.length ? [] : selectedTypes),
    [selectedTypes],
  );
  const apiStatuses = useMemo(() => selectedStatuses, [selectedStatuses]);

  const summaryQuery = useRunTimelineSummary(runId);
  const { data: summaryData, refetch: refetchSummary } = summaryQuery;
  const eventsQuery = useRunTimelineEvents(runId, { types: apiTypes, statuses: apiStatuses, limit: 100, order: 'desc' });
  const [events, setEvents] = useState<RunTimelineEvent[]>([]);
  const [nextCursor, setNextCursorState] = useState<RunTimelineEventsCursor | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const cursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const catchUpRef = useRef<Promise<unknown> | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const replaceEventsRef = useRef(false);
  const lastRunIdRef = useRef<string | undefined>(undefined);
  const lastFilterKeyRef = useRef<string>('');
  const reachedHistoryEndRef = useRef(false);
  const olderCursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const catchUpCursorParamModeRef = useRef<CursorParamMode>('both');
  const loadOlderCursorParamModeRef = useRef<CursorParamMode>('both');
  const canTerminate = summaryData?.status === 'running';

  const updateOlderCursor = useCallback(
    (
      update:
        | RunTimelineEventsCursor
        | null
        | ((prev: RunTimelineEventsCursor | null) => RunTimelineEventsCursor | null),
    ) => {
      const next =
        typeof update === 'function'
          ? (update as (prev: RunTimelineEventsCursor | null) => RunTimelineEventsCursor | null)(olderCursorRef.current)
          : update;
      olderCursorRef.current = next;
      setNextCursorState(next);
    },
    [],
  );

  const selectedTypesRef = useRef(selectedTypes);
  const selectedStatusesRef = useRef(selectedStatuses);
  const apiTypesRef = useRef(apiTypes);
  const apiStatusesRef = useRef(apiStatuses);

  useEffect(() => {
    selectedTypesRef.current = selectedTypes;
  }, [selectedTypes]);

  useEffect(() => {
    selectedStatusesRef.current = selectedStatuses;
  }, [selectedStatuses]);

  useEffect(() => {
    apiTypesRef.current = apiTypes;
  }, [apiTypes]);

  useEffect(() => {
    apiStatusesRef.current = apiStatuses;
  }, [apiStatuses]);

  const setCursor = useCallback(
    (cursor: RunTimelineEventsCursor | null, opts?: { force?: boolean }) => {
      if (!runId) return;
      if (!cursor) {
        cursorRef.current = null;
        graphSocket.setRunCursor(runId, null, { force: true });
        return;
      }
      const current = cursorRef.current;
      if (!current || opts?.force || compareCursors(cursor, current) > 0) {
        cursorRef.current = cursor;
        graphSocket.setRunCursor(runId, cursor, { force: opts?.force });
      }
    },
    [runId],
  );

  const updateEventsState = useCallback(
    (updater: (prev: RunTimelineEvent[]) => RunTimelineEvent[], opts?: { setCursor?: boolean }) => {
      setEvents((prev) => {
        const next = updater(prev);
        if (opts?.setCursor !== false) {
          const latest = next[next.length - 1];
          if (latest) setCursor(toCursor(latest));
        }
        return next;
      });
    },
    [setCursor],
  );

  useEffect(() => {
    const currentFilterKey = JSON.stringify([selectedTypes, selectedStatuses]);
    const previousRunId = lastRunIdRef.current;
    const previousFilterKey = lastFilterKeyRef.current;

    lastRunIdRef.current = runId;
    lastFilterKeyRef.current = currentFilterKey;

    if (!runId) {
      setEvents([]);
      cursorRef.current = null;
      return;
    }

    if (previousRunId !== runId) {
      setIsTerminating(false);
      replaceEventsRef.current = true;
      hasAutoScrolledRef.current = false;
      pendingScrollAdjustmentRef.current = null;
      updateOlderCursor(null);
      reachedHistoryEndRef.current = false;
      setLoadOlderError(null);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      catchUpRef.current = null;
      setEvents([]);
      cursorRef.current = null;
      setCursor(null, { force: true });
      return;
    }

    if (previousFilterKey !== currentFilterKey) {
      updateOlderCursor(null);
      reachedHistoryEndRef.current = false;
      setLoadOlderError(null);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      catchUpRef.current = null;
      setCursor(null, { force: true });
      updateEventsState((prev) => {
        if (!prev.length) return prev;
        return prev.filter((evt) => matchesFilters(evt, selectedTypes, selectedStatuses));
      });
    }
  }, [runId, selectedTypes, selectedStatuses, setCursor, updateEventsState, updateOlderCursor]);

  useEffect(() => {
    if (!eventsQuery.data) return;

    const incoming = eventsQuery.data.items ?? [];
    const newestIncoming = incoming.length > 0
      ? incoming.reduce<RunTimelineEvent>((latest, event) => (compareEvents(event, latest) > 0 ? event : latest), incoming[0])
      : null;
    const queryCursor = eventsQuery.data.nextCursor ?? null;

    setLoadOlderError(null);
    const shouldReplace = replaceEventsRef.current;
    const mode: 'MERGE' | 'REPLACE' = shouldReplace ? 'REPLACE' : 'MERGE';
    updateEventsState((prev) => {
      const base = shouldReplace ? [] : prev;
      return mergeEvents(base, incoming, selectedTypes, selectedStatuses, {
        context: {
          source: 'base-query',
          runId,
          filters: { types: apiTypes, statuses: apiStatuses },
          cursor: queryCursor,
          mode,
        },
      });
    }, { setCursor: false });
    if (newestIncoming) {
      setCursor(toCursor(newestIncoming), { force: true });
    } else {
      setCursor(null, { force: true });
    }
    replaceEventsRef.current = false;
    if (!queryCursor) {
      reachedHistoryEndRef.current = true;
      updateOlderCursor(null);
    } else if (!reachedHistoryEndRef.current) {
      reachedHistoryEndRef.current = false;
      updateOlderCursor((prev) => {
        if (!prev) return queryCursor;
        return compareCursors(queryCursor, prev) < 0 ? queryCursor : prev;
      });
    }
  }, [eventsQuery.data, selectedTypes, selectedStatuses, updateEventsState, updateOlderCursor, setCursor, runId, apiTypes, apiStatuses]);

  const fetchSinceCursor = useCallback(() => {
    if (!runId) return Promise.resolve();
    if (catchUpRef.current) return catchUpRef.current;

    const cursor = graphSocket.getRunCursor(runId) ?? cursorRef.current;
    if (!cursor) {
      const fallback = eventsQuery.refetch();
      catchUpRef.current = fallback.finally(() => {
        catchUpRef.current = null;
      });
      return catchUpRef.current;
    }

    const promise = (async () => {
      try {
        const currentApiTypes = apiTypesRef.current;
        const currentApiStatuses = apiStatusesRef.current;
        const attemptModes = buildCursorAttemptModes(catchUpCursorParamModeRef.current);

        let response: RunTimelineEventsResponse | null = null;
        let successfulMode: CursorParamMode | null = null;

        for (let i = 0; i < attemptModes.length; i += 1) {
          const mode = attemptModes[i];
          const candidate = await runs.timelineEvents(runId, {
            types: currentApiTypes.length > 0 ? currentApiTypes.join(',') : undefined,
            statuses: currentApiStatuses.length > 0 ? currentApiStatuses.join(',') : undefined,
            cursorTs: cursor.ts,
            cursorId: cursor.id,
            cursorParamMode: mode,
          });
          if (!isNonAdvancingPage(candidate, cursor)) {
            response = candidate;
            successfulMode = mode;
            break;
          }
        }

        if (!response) {
          reachedHistoryEndRef.current = true;
          return;
        }

        catchUpCursorParamModeRef.current = successfulMode ?? catchUpCursorParamModeRef.current;

        const items = response.items ?? [];
        if (items.length > 0) {
          const latestSelectedTypes = selectedTypesRef.current;
          const latestSelectedStatuses = selectedStatusesRef.current;
          updateEventsState((prev) => mergeEvents(prev, items, latestSelectedTypes, latestSelectedStatuses, {
            context: {
              source: 'catch-up',
              runId,
              filters: { types: currentApiTypes, statuses: currentApiStatuses },
              cursor,
              mode: 'MERGE',
            },
          }));
          const newest = items[items.length - 1];
          if (newest) setCursor(toCursor(newest));
        }
      } catch (_err) {
        await eventsQuery.refetch();
      }
    })();

    catchUpRef.current = promise.finally(() => {
      catchUpRef.current = null;
    });
    return catchUpRef.current;
  }, [runId, eventsQuery, updateEventsState, setCursor]);

  const handleTerminate = useCallback(async () => {
    if (!runId) return;
    if (typeof window !== 'undefined' && !window.confirm('Terminate this run? This will attempt to stop the active run.')) {
      return;
    }
    setIsTerminating(true);
    try {
      await runs.terminate(runId);
      notifySuccess('Termination signaled');
      try {
        await refetchSummary();
      } catch {
        /* ignore summary refetch errors */
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Failed to terminate run';
      notifyError(message);
    } finally {
      setIsTerminating(false);
    }
  }, [refetchSummary, runId]);

  useEffect(() => {
    if (!runId) return;
    const room = `run:${runId}`;
    graphSocket.subscribe([room]);
    const off = graphSocket.onRunEvent(({ runId: incomingRunId, event }) => {
      if (incomingRunId !== runId) return;
      const currentApiTypes = apiTypesRef.current;
      const currentApiStatuses = apiStatusesRef.current;
      updateEventsState((prev) => mergeEvents(prev, [event], selectedTypes, selectedStatuses, {
        context: {
          source: 'socket-event',
          runId,
          filters: { types: currentApiTypes, statuses: currentApiStatuses },
          cursor: cursorRef.current,
          mode: 'MERGE',
        },
      }));
      setCursor(toCursor(event));
      summaryQuery.refetch();
    });
    const offStatus = graphSocket.onRunStatusChanged(({ run }) => {
      if (run.id === runId) summaryQuery.refetch();
    });
    const offReconnect = graphSocket.onReconnected(() => {
      void fetchSinceCursor();
      summaryQuery.refetch();
    });
    return () => {
      off();
      offStatus();
      offReconnect();
      graphSocket.unsubscribe([room]);
    };
  }, [runId, selectedTypes, selectedStatuses, summaryQuery, updateEventsState, setCursor, fetchSinceCursor]);

  const isDefaultFilters = selectedTypes.length === EVENT_TYPES.length && selectedStatuses.length === 0;

  const toggleType = (value: RunEventType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length === 0 ? EVENT_TYPES : next;
      }
      const next = Array.from(new Set([...prev, value])) as RunEventType[];
      next.sort((a, b) => EVENT_TYPES.indexOf(a) - EVENT_TYPES.indexOf(b));
      if (next.length > EVENT_TYPES.length) return EVENT_TYPES;
      return next;
    });
  };

  const toggleStatus = (value: RunEventStatus) => {
    setSelectedStatuses((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      return [...prev, value];
    });
  };

  const typeFilters = useMemo(
    () =>
      EVENT_TYPES.map((type) => ({
        type,
        label:
          type === 'invocation_message'
            ? 'Messages'
            : type === 'llm_call'
              ? 'LLM'
              : type === 'tool_execution'
                ? 'Tools'
                : type === 'summarization'
                  ? 'Summaries'
                  : 'Injected',
        active: selectedTypes.includes(type),
      })),
    [selectedTypes],
  );

  const statusFilters = useMemo(
    () => STATUS_TYPES.map((status) => ({ status, active: selectedStatuses.includes(status) })),
    [selectedStatuses],
  );

  const summary = summaryData;
  const summaryItems = useMemo(
    () => {
      const items: Array<{ label: string; value: string }> = [
        {
          label: 'Status',
          value: summary ? summary.status : summaryQuery.isLoading ? 'Loading…' : '—',
        },
        {
          label: 'Total events',
          value: summary ? String(summary.totalEvents) : '—',
        },
        {
          label: 'First',
          value: summary?.firstEventAt ? new Date(summary.firstEventAt).toLocaleString() : '—',
        },
        {
          label: 'Last',
          value: summary?.lastEventAt ? new Date(summary.lastEventAt).toLocaleString() : '—',
        },
      ];
      if (summary) {
        typeFilters.forEach((entry) => {
          items.push({ label: entry.label, value: String(summary.countsByType[entry.type] ?? 0) });
        });
      }
      return items;
    },
    [summary, summaryQuery.isLoading, typeFilters],
  );

  const selectedEventId = searchParams.get('eventId');
  const selectedEvent = selectedEventId ? events.find((evt) => evt.id === selectedEventId) : undefined;
  const lastSelectedIdRef = useRef<string | null>(selectedEventId ?? null);
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  const selectEvent = useCallback(
    (eventId: string, options: { focus?: boolean } = {}) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('eventId', eventId);
        return next;
      }, { replace: true });
      const shouldFocus = options.focus ?? true;
      if (shouldFocus) {
        requestAnimationFrame(() => {
          listRef.current?.focus();
        });
      }
    },
    [setSearchParams],
  );

  const clearSelection = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('eventId');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const loadOlderEvents = useCallback(async () => {
    if (!runId) return;
    const cursor = olderCursorRef.current;
    if (!cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(null);
    const listNode = listRef.current;
    if (listNode && events.length > 0) {
      pendingScrollAdjustmentRef.current = {
        prevScrollHeight: listNode.scrollHeight,
        prevScrollTop: listNode.scrollTop,
      };
    } else {
      pendingScrollAdjustmentRef.current = null;
    }
    const currentApiTypes = apiTypesRef.current;
    const currentApiStatuses = apiStatusesRef.current;
    const attemptModes = buildCursorAttemptModes(loadOlderCursorParamModeRef.current);
    let response: RunTimelineEventsResponse | null = null;
    let successfulMode: CursorParamMode | null = null;

    try {
      for (let i = 0; i < attemptModes.length; i += 1) {
        const mode = attemptModes[i];
        const candidate = await runs.timelineEvents(runId, {
          types: currentApiTypes.length > 0 ? currentApiTypes.join(',') : undefined,
          statuses: currentApiStatuses.length > 0 ? currentApiStatuses.join(',') : undefined,
          limit: 100,
          order: 'desc',
          cursorTs: cursor.ts,
          cursorId: cursor.id,
          cursorParamMode: mode,
        });
        if (!isNonAdvancingPage(candidate, cursor)) {
          response = candidate;
          successfulMode = mode;
          break;
        }
      }

      if (!response) {
        reachedHistoryEndRef.current = true;
        updateOlderCursor(null);
        pendingScrollAdjustmentRef.current = null;
        return;
      }

      loadOlderCursorParamModeRef.current = successfulMode ?? loadOlderCursorParamModeRef.current;

      const items = response.items ?? [];
      if (response.nextCursor) {
        reachedHistoryEndRef.current = false;
        updateOlderCursor(response.nextCursor);
      } else {
        reachedHistoryEndRef.current = true;
        updateOlderCursor(null);
      }
      if (items.length > 0) {
        const latestSelectedTypes = selectedTypesRef.current;
        const latestSelectedStatuses = selectedStatusesRef.current;
        updateEventsState((prev) => mergeEvents(prev, items, latestSelectedTypes, latestSelectedStatuses, {
          context: {
            source: 'load-older',
            runId,
            filters: { types: currentApiTypes, statuses: currentApiStatuses },
            cursor,
            mode: 'MERGE',
          },
        }));
      } else {
        pendingScrollAdjustmentRef.current = null;
      }
    } catch (error) {
      pendingScrollAdjustmentRef.current = null;
      setLoadOlderError((error as Error)?.message ?? 'Failed to load older events');
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [runId, events, updateEventsState, updateOlderCursor]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (!events.length) return;
    if (eventsQuery.isFetching) return;
    hasAutoScrolledRef.current = true;
    requestAnimationFrame(() => {
      const listNode = listRef.current;
      if (listNode) {
        listNode.scrollTop = listNode.scrollHeight;
      }
    });
  }, [events, eventsQuery.isFetching]);

  useLayoutEffect(() => {
    const adjustment = pendingScrollAdjustmentRef.current;
    if (!adjustment) return;
    const listNode = listRef.current;
    if (!listNode) {
      pendingScrollAdjustmentRef.current = null;
      return;
    }
    const delta = listNode.scrollHeight - adjustment.prevScrollHeight;
    listNode.scrollTop = adjustment.prevScrollTop + delta;
    pendingScrollAdjustmentRef.current = null;
  }, [events, runId]);

  useEffect(() => {
    const itemsCount = eventsQuery.data?.items?.length ?? 0;
    if (!events.length) {
      if (selectedEventId && !eventsQuery.isFetching && itemsCount === 0) {
        clearSelection();
      }
      return;
    }
    const latestEvent = events[events.length - 1];
    if (selectedEventId) {
      const exists = events.some((evt) => evt.id === selectedEventId);
      if (!exists && isMdUp && !eventsQuery.isFetching) {
        if (latestEvent) selectEvent(latestEvent.id, { focus: false });
      }
      return;
    }
    if (isMdUp && !eventsQuery.isFetching && latestEvent) {
      selectEvent(latestEvent.id, { focus: false });
    }
  }, [events, selectedEventId, selectEvent, clearSelection, isMdUp, eventsQuery.isFetching, eventsQuery.data]);

  useEffect(() => {
    const nextSelection = selectedEventId ?? null;
    if (!runId) {
      lastSelectedIdRef.current = nextSelection;
      return;
    }
    const previous = lastSelectedIdRef.current;
    if (previous === nextSelection) return;
    lastSelectedIdRef.current = nextSelection;
  }, [selectedEventId, runId]);

  useEffect(() => {
    const node = selectedItemRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedEventId]);

  const handleListKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!events.length) return;
      const currentIndex = selectedEventId ? events.findIndex((evt) => evt.id === selectedEventId) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(events.length - 1, currentIndex + 1);
        const nextEvent = events[nextIndex];
        if (nextEvent) selectEvent(nextEvent.id, { focus: false });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
        const nextEvent = events[nextIndex];
        if (nextEvent) selectEvent(nextEvent.id, { focus: false });
      } else if (e.key === 'Home') {
        e.preventDefault();
        const nextEvent = events[0];
        if (nextEvent) selectEvent(nextEvent.id, { focus: false });
      } else if (e.key === 'End') {
        e.preventDefault();
        const nextEvent = events[events.length - 1];
        if (nextEvent) selectEvent(nextEvent.id, { focus: false });
      }
    },
    [events, selectedEventId, selectEvent],
  );

  const handleSelect = useCallback(
    (eventId: string) => {
      selectEvent(eventId, { focus: isMdUp });
    },
    [selectEvent, isMdUp],
  );

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1 className="text-xl font-semibold">Run Timeline</h1>
          {threadId && (
            <Link to={`/agents/threads`} className="text-sm text-blue-600 hover:underline">
              Thread {threadId.slice(0, 8)}
            </Link>
          )}
          {runId && <span className="text-sm text-gray-600">Run {runId.slice(0, 8)}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-gray-600">
            {summaryItems.map((item) => (
              <span key={item.label} className="flex items-center gap-1">
                <span className="uppercase tracking-wide text-[10px] text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-800">{item.value}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500">Types</span>
          {typeFilters.map((entry) => (
            <button
              key={entry.type}
              type="button"
              onClick={() => toggleType(entry.type)}
              className={`px-3 py-1 text-xs border ${entry.active ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-700 hover:bg-gray-100'}`}
            >
              {entry.label}
            </button>
          ))}
          <span className="ml-4 text-xs uppercase tracking-wide text-gray-500">Statuses</span>
          {statusFilters.map((entry) => (
            <button
              key={entry.status}
              type="button"
              onClick={() => toggleStatus(entry.status)}
              className={`px-3 py-1 text-xs border ${entry.active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-transparent text-gray-700 hover:bg-gray-100'}`}
            >
              {entry.status}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="px-3 py-1 text-xs border bg-transparent hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              onClick={() => {
                setSelectedTypes(EVENT_TYPES);
                setSelectedStatuses([]);
              }}
              disabled={isDefaultFilters}
            >
              Reset
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs border bg-transparent hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              onClick={() => eventsQuery.refetch()}
              disabled={eventsQuery.isFetching}
            >
              Refresh
            </button>
            {canTerminate && (
              <button
                type="button"
                className="px-3 py-1 text-xs border bg-transparent text-red-600 border-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                onClick={handleTerminate}
                disabled={isTerminating}
              >
                {isTerminating ? 'Terminating…' : 'Terminate'}
              </button>
            )}
          </div>
        </div>
        {eventsQuery.isError && (
          <div className="mt-2 text-xs text-red-600">{(eventsQuery.error as Error)?.message ?? 'Failed to load events'}</div>
        )}
        {eventsQuery.isFetching && <div className="mt-2 text-xs text-gray-500">Loading events…</div>}
      </div>

      <div className="flex-1 min-h-0">
        <div className="flex h-full min-h-0 flex-col gap-4 md:grid md:grid-cols-[360px_minmax(0,1fr)] md:gap-0">
          <section
            className="flex min-h-0 w-full flex-col overflow-hidden md:border-r md:border-gray-200"
            role="region"
            aria-labelledby="run-timeline-events-heading"
          >
            <header
              id="run-timeline-events-heading"
              className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Events
            </header>
            <div className="px-3 py-2 text-xs text-gray-500" aria-live="polite">
              {events.length === 0 && !eventsQuery.isFetching ? 'No events for selected filters.' : null}
            </div>
            <div
              ref={listRef}
              role="listbox"
              aria-labelledby="run-timeline-events-heading"
              aria-busy={eventsQuery.isFetching}
              aria-activedescendant={selectedEventId ? `run-event-option-${selectedEventId}` : undefined}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              className="flex-1 min-h-0 space-y-2 overflow-y-auto focus:outline-none"
            >
              {(nextCursor || events.length > 0 || loadOlderError) && (
                <div className="py-2">
                  {nextCursor ? (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadOlderEvents()}
                        className="rounded border px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingOlder}
                      >
                        {loadingOlder ? 'Loading…' : 'Load older events'}
                      </button>
                    </div>
                  ) : events.length > 0 ? (
                    <div className="text-center text-xs uppercase tracking-wide text-gray-400">Beginning of timeline</div>
                  ) : null}
                  {loadOlderError && (
                    <div className="mt-2 text-center text-xs text-red-600">{loadOlderError}</div>
                  )}
                </div>
              )}
              {events.map((event) => (
                <RunTimelineEventListItem
                  key={event.id}
                  event={event}
                  selected={event.id === selectedEventId}
                  onSelect={handleSelect}
                  ref={(node) => {
                    if (event.id === selectedEventId) {
                      selectedItemRef.current = node;
                    } else if (selectedItemRef.current === node) {
                      selectedItemRef.current = null;
                    }
                  }}
                />
              ))}
            </div>
          </section>
          <section
            className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex"
            role="region"
            aria-label="Run event details"
          >
            <div className={`flex-1 min-h-0 overflow-hidden${selectedEvent ? ' p-3 md:p-4' : ''}`}>
              {selectedEvent ? (
                <RunTimelineEventDetails event={selectedEvent} />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-sm text-gray-500">
                  Select an event to view details.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {!isMdUp && selectedEvent && <MobileEventModal event={selectedEvent} onClose={clearSelection} />}
    </div>
  );
}

function MobileEventModal({ event, onClose }: { event: RunTimelineEvent; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useMemo(() => `run-event-modal-${event.id}`, [event.id]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mt-auto w-full max-h-[90vh] overflow-hidden rounded-t-lg bg-white shadow-lg"
      >
        <div ref={dialogRef} className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 id={titleId} className="text-sm font-semibold text-gray-900">
              {getEventTypeLabel(event)}
            </h2>
            <button ref={closeRef} className="text-xs px-2 py-1 border rounded" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <RunTimelineEventDetails event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}
