import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import RunScreen, { type EventFilter, type StatusFilter } from '@/components/screens/RunScreen';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { buildTimelineQueryParams, runs } from '@/api/modules/runs';
import type {
  RunEventStatus,
  RunEventType,
  RunTimelineEvent,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
  RunTimelineSummary,
} from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';
import { notifyError, notifySuccess } from '@/lib/notify';
import { formatDuration } from '@/components/agents/runTimelineFormatting';
import type { RunEvent } from '@/components/RunEventsList';
import type { Status } from '@/components/StatusIndicator';
import {
  aggregateLlmUsage,
  mapRunSummaryStatusToScreenStatus,
  mapTimelineEventToRunEvent,
  toEventFilter,
  toStatusFilter,
} from './utils/timelineEventToRunEvent';

const EVENT_FILTERS_ALL: EventFilter[] = ['message', 'llm', 'tool', 'summary'];
const STATUS_FILTERS_ALL: StatusFilter[] = ['running', 'finished', 'failed', 'terminated'];

const EVENT_FILTER_TO_SOURCE_TYPES: Record<EventFilter, RunEventType[]> = {
  message: ['invocation_message', 'injection'],
  llm: ['llm_call'],
  tool: ['tool_execution'],
  summary: ['summarization'],
};

const STATUS_FILTER_TO_SOURCE_STATUSES: Record<StatusFilter, RunEventStatus[]> = {
  running: ['pending', 'running'],
  finished: ['success'],
  failed: ['error'],
  terminated: ['cancelled'],
};

const GLOBAL_FOLLOW_STORAGE_KEY = 'ui.timeline.follow.enabled';
const LEGACY_FOLLOW_STORAGE_PREFIX = 'timeline-follow:';

type CursorParamMode = 'both' | 'plain' | 'bracketed';

type MergeContextSource = 'base-query' | 'load-older' | 'socket-event' | 'catch-up';

type MergeContext = {
  source: MergeContextSource | string;
  runId?: string;
  filters?: { eventFilters: EventFilter[]; statusFilters: StatusFilter[] };
  cursor?: RunTimelineEventsCursor | null;
  mode?: 'MERGE' | 'REPLACE';
};

type MergeStats = {
  incomingLength: number;
  prevLength: number;
  nextLength: number;
  included: number;
  replaced: number;
  removed: number;
  deduped: number;
  filtered: number;
  first?: { id: string; ts: string } | null;
  last?: { id: string; ts: string } | null;
};

type MergeOptions = {
  context?: MergeContext;
  captureStats?: (stats: MergeStats) => void;
};

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

function matchesFilters(event: RunTimelineEvent, eventFilters: EventFilter[], statusFilters: StatusFilter[]): boolean {
  if (eventFilters.length > 0) {
    const typeFilter = toEventFilter(event);
    if (!eventFilters.includes(typeFilter)) {
      return false;
    }
  }

  if (statusFilters.length > 0) {
    const statusFilter = toStatusFilter(event.status);
    if (!statusFilters.includes(statusFilter)) {
      return false;
    }
  }

  return true;
}

function summarizeEvent(event: RunTimelineEvent | undefined): { id: string; ts: string } | null {
  if (!event) return null;
  return { id: event.id, ts: event.ts };
}

function mergeEvents(
  prev: RunTimelineEvent[],
  incoming: RunTimelineEvent[],
  eventFilters: EventFilter[],
  statusFilters: StatusFilter[],
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
      first: summarizeEvent(prev[0]),
      last: summarizeEvent(prev[prevLength - 1]),
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
    const include = matchesFilters(event, eventFilters, statusFilters);
    if (idx >= 0) {
      if (include) {
        const existingSerialized = JSON.stringify(next[idx]);
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
    first: summarizeEvent(sorted[0]),
    last: summarizeEvent(sorted[sorted.length - 1]),
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

function toCursor(event: RunTimelineEvent): RunTimelineEventsCursor {
  return { ts: event.ts, id: event.id };
}

function buildCursorAttemptModes(preferred: CursorParamMode): CursorParamMode[] {
  if (preferred === 'both') return ['both', 'bracketed', 'plain'];
  if (preferred === 'bracketed') return ['bracketed', 'plain'];
  return ['plain', 'bracketed'];
}

function isNonAdvancingPage(response: RunTimelineEventsResponse, cursor: RunTimelineEventsCursor): boolean {
  const items = response.items ?? [];
  const lastMatches = items.length > 0 && compareCursors(toCursor(items[items.length - 1]), cursor) === 0;
  const nextMatches = response.nextCursor ? compareCursors(response.nextCursor, cursor) === 0 : false;
  return lastMatches || nextMatches;
}

function parseFollowValue(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function readLegacyFollowFromStorage(runId: string | undefined): boolean | null {
  if (!runId || typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(`${LEGACY_FOLLOW_STORAGE_PREFIX}${runId}`);
  return parseFollowValue(raw);
}

function readGlobalFollowFromStorage(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(GLOBAL_FOLLOW_STORAGE_KEY);
  return parseFollowValue(raw);
}

function writeGlobalFollowToStorage(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GLOBAL_FOLLOW_STORAGE_KEY, value ? 'true' : 'false');
}

function resolveFollowDefault(searchParams: URLSearchParams, isMdUp: boolean): boolean {
  const paramValue = parseFollowValue(searchParams.get('follow'));
  if (paramValue !== null) return paramValue;
  const stored = readGlobalFollowFromStorage();
  if (stored !== null) return stored;
  return isMdUp;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [query]);

  return matches;
}

function deriveDuration(summary: RunTimelineSummary | undefined): string {
  if (!summary) return '—';
  const start = summary.firstEventAt ?? summary.createdAt;
  const end = summary.lastEventAt ?? summary.updatedAt;
  const startTs = start ? Date.parse(start) : Number.NaN;
  const endTs = end ? Date.parse(end) : Number.NaN;
  if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs < startTs) return '—';
  return formatDuration(endTs - startTs);
}

function normalizeEventFilters(filters: EventFilter[]): EventFilter[] {
  if (filters.length === 0) return [];
  const set = new Set(filters);
  return EVENT_FILTERS_ALL.filter((filter) => set.has(filter));
}

function normalizeStatusFilters(filters: StatusFilter[]): StatusFilter[] {
  if (filters.length === 0) return [];
  const set = new Set(filters);
  return STATUS_FILTERS_ALL.filter((filter) => set.has(filter));
}

function buildEventFiltersForApi(filters: EventFilter[]): RunEventType[] {
  if (filters.length === EVENT_FILTERS_ALL.length || filters.length === 0) {
    return [];
  }
  const collected = new Set<RunEventType>();
  filters.forEach((filter) => {
    EVENT_FILTER_TO_SOURCE_TYPES[filter].forEach((type) => collected.add(type));
  });
  return Array.from(collected);
}

function buildStatusFiltersForApi(filters: StatusFilter[]): RunEventStatus[] {
  if (filters.length === 0) return [];
  const collected = new Set<RunEventStatus>();
  filters.forEach((filter) => {
    STATUS_FILTER_TO_SOURCE_STATUSES[filter].forEach((status) => collected.add(status));
  });
  return Array.from(collected);
}

function buildStatistics(summary: RunTimelineSummary | undefined) {
  const countsByType = summary?.countsByType ?? {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 0,
    summarization: 0,
  };
  const countsByStatus = summary?.countsByStatus ?? {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  };

  return {
    totalEvents: summary?.totalEvents ?? 0,
    messages: (countsByType.invocation_message ?? 0) + (countsByType.injection ?? 0),
    llm: countsByType.llm_call ?? 0,
    tools: countsByType.tool_execution ?? 0,
    summaries: countsByType.summarization ?? 0,
    byStatus: {
      running: (countsByStatus.pending ?? 0) + (countsByStatus.running ?? 0),
      finished: countsByStatus.success ?? 0,
      failed: countsByStatus.error ?? 0,
      terminated: countsByStatus.cancelled ?? 0,
    } satisfies Record<StatusFilter, number>,
  };
}

export function AgentsRunScreen() {
  const params = useParams<{ threadId: string; runId: string }>();
  const threadId = params.threadId;
  const runId = params.runId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => searchParams.get('eventId'));
  const updateSearchParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        mutator(next);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const paramValue = searchParams.get('eventId');
    setSelectedEventId((prev) => (prev === paramValue ? prev : paramValue));
  }, [searchParams]);

  const isMdUp = useMediaQuery('(min-width: 768px)');
  const [follow, setFollow] = useState(() => resolveFollowDefault(searchParams, isMdUp));
  const followRef = useRef(follow);
  const hasMigratedLegacyRef = useRef(false);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    if (!runId) return;
    const paramValue = parseFollowValue(searchParams.get('follow'));

    if (!hasMigratedLegacyRef.current) {
      if (paramValue === null && readGlobalFollowFromStorage() === null) {
        const legacy = readLegacyFollowFromStorage(runId);
        if (legacy !== null) {
          writeGlobalFollowToStorage(legacy);
        }
      }
      hasMigratedLegacyRef.current = true;
    }

    const resolved = resolveFollowDefault(searchParams, isMdUp);
    setFollow((prev) => (prev === resolved ? prev : resolved));
    followRef.current = resolved;
    writeGlobalFollowToStorage(resolved);
    if (paramValue === null) {
      updateSearchParams((next) => {
        next.set('follow', resolved ? 'true' : 'false');
      });
    }
  }, [runId, searchParams, isMdUp, updateSearchParams]);

  const persistFollow = useCallback(
    (value: boolean) => {
      writeGlobalFollowToStorage(value);
      updateSearchParams((next) => {
        next.set('follow', value ? 'true' : 'false');
      });
    },
    [updateSearchParams],
  );

  const commitFollow = useCallback(
    (value: boolean) => {
      if (followRef.current === value) return;
      followRef.current = value;
      setFollow(value);
      persistFollow(value);
    },
    [persistFollow],
  );

  const [eventFilters, setEventFilters] = useState<EventFilter[]>(EVENT_FILTERS_ALL);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>([]);

  useEffect(() => {
    setEventFilters(EVENT_FILTERS_ALL);
    setStatusFilters([]);
    setTokensPopoverOpen(false);
    setRunsPopoverOpen(false);
  }, [runId]);

  const apiTypes = useMemo(() => buildEventFiltersForApi(eventFilters), [eventFilters]);
  const apiStatuses = useMemo(() => buildStatusFiltersForApi(statusFilters), [statusFilters]);

  const summaryQuery = useRunTimelineSummary(runId);
  const eventsQuery = useRunTimelineEvents(runId, { types: apiTypes, statuses: apiStatuses, limit: 100, order: 'desc' });

  const [events, setEvents] = useState<RunTimelineEvent[]>([]);
  const [olderCursor, setOlderCursor] = useState<RunTimelineEventsCursor | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const [tokensPopoverOpen, setTokensPopoverOpen] = useState(false);
  const [runsPopoverOpen, setRunsPopoverOpen] = useState(false);

  const cursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const catchUpRef = useRef<Promise<unknown> | null>(null);
  const replaceEventsRef = useRef(false);
  const lastRunIdRef = useRef<string | undefined>(undefined);
  const lastFilterKeyRef = useRef<string>('');
  const catchUpCursorParamModeRef = useRef<CursorParamMode>('both');
  const loadOlderCursorParamModeRef = useRef<CursorParamMode>('both');
  const loadingOlderRef = useRef(false);

  const eventFiltersRef = useRef(eventFilters);
  const statusFiltersRef = useRef(statusFilters);
  const apiTypesRef = useRef(apiTypes);
  const apiStatusesRef = useRef(apiStatuses);

  useEffect(() => {
    eventFiltersRef.current = eventFilters;
  }, [eventFilters]);

  useEffect(() => {
    statusFiltersRef.current = statusFilters;
  }, [statusFilters]);

  useEffect(() => {
    apiTypesRef.current = apiTypes;
  }, [apiTypes]);

  useEffect(() => {
    apiStatusesRef.current = apiStatuses;
  }, [apiStatuses]);

  useEffect(() => {
    const currentFilterKey = JSON.stringify([eventFilters, statusFilters]);
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
      replaceEventsRef.current = true;
      setEvents([]);
      cursorRef.current = null;
      setOlderCursor(null);
      setLoadingOlder(false);
      setLoadOlderError(null);
      catchUpRef.current = null;
      catchUpCursorParamModeRef.current = 'both';
      loadOlderCursorParamModeRef.current = 'both';
      return;
    }

    if (previousFilterKey !== currentFilterKey) {
      setOlderCursor(null);
      setLoadingOlder(false);
      setLoadOlderError(null);
      catchUpRef.current = null;
      catchUpCursorParamModeRef.current = 'both';
      loadOlderCursorParamModeRef.current = 'both';
      cursorRef.current = null;
      setEvents((prev) => prev.filter((event) => matchesFilters(event, eventFilters, statusFilters)));
    }
  }, [eventFilters, statusFilters, runId]);

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
    if (!eventsQuery.data) return;

    const incoming = eventsQuery.data.items ?? [];
    const newestIncoming = incoming.length > 0
      ? incoming.reduce<RunTimelineEvent>((latest, event) => (compareEvents(event, latest) > 0 ? event : latest), incoming[0])
      : null;
    const nextCursor = eventsQuery.data.nextCursor ?? null;

    setLoadOlderError(null);
    const shouldReplace = replaceEventsRef.current;
    updateEventsState((prev) => {
      const base = shouldReplace ? [] : prev;
      return mergeEvents(base, incoming, eventFilters, statusFilters, {
        context: {
          source: 'base-query',
          runId,
          filters: { eventFilters, statusFilters },
          cursor: nextCursor,
          mode: shouldReplace ? 'REPLACE' : 'MERGE',
        },
      });
    }, { setCursor: false });

    if (newestIncoming) {
      setCursor(toCursor(newestIncoming), { force: true });
    } else {
      setCursor(null, { force: true });
    }

    replaceEventsRef.current = false;
    setOlderCursor(nextCursor);
  }, [eventsQuery.data, eventFilters, statusFilters, updateEventsState, setCursor, runId]);

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
          const candidate = await runs.timelineEvents(
            runId,
            buildTimelineQueryParams({
              types: currentApiTypes,
              statuses: currentApiStatuses,
              cursor,
              cursorParamMode: mode,
            }),
          );
          if (!isNonAdvancingPage(candidate, cursor)) {
            response = candidate;
            successfulMode = mode;
            break;
          }
        }

        if (!response) {
          return;
        }

        catchUpCursorParamModeRef.current = successfulMode ?? catchUpCursorParamModeRef.current;

        const items = response.items ?? [];
        if (items.length > 0) {
          const latestEventFilters = eventFiltersRef.current;
          const latestStatusFilters = statusFiltersRef.current;
          updateEventsState((prev) => mergeEvents(prev, items, latestEventFilters, latestStatusFilters, {
            context: {
              source: 'catch-up',
              runId,
              filters: { eventFilters: latestEventFilters, statusFilters: latestStatusFilters },
              cursor,
              mode: 'MERGE',
            },
          }));
          const newest = items[items.length - 1];
          if (newest) setCursor(toCursor(newest));
        }
      } catch (_error) {
        await eventsQuery.refetch();
      }
    })();

    catchUpRef.current = promise.finally(() => {
      catchUpRef.current = null;
    });
    return catchUpRef.current;
  }, [runId, eventsQuery, updateEventsState, setCursor]);

  const { refetch: refetchSummary } = summaryQuery;

  const handleTerminate = useCallback(async () => {
    if (!runId) return;
    if (typeof window !== 'undefined' && !window.confirm('Terminate this run? This will attempt to stop the active run.')) {
      return;
    }
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
    }
  }, [refetchSummary, runId]);

  const loadOlderEvents = useCallback(async () => {
    if (!runId) return;
    const cursor = olderCursor;
    if (!cursor || loadingOlderRef.current) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(null);

    const currentApiTypes = apiTypesRef.current;
    const currentApiStatuses = apiStatusesRef.current;
    const latestEventFilters = eventFiltersRef.current;
    const latestStatusFilters = statusFiltersRef.current;
    const attemptModes = buildCursorAttemptModes(loadOlderCursorParamModeRef.current);

    try {
      let response: RunTimelineEventsResponse | null = null;
      let successfulMode: CursorParamMode | null = null;

      for (let i = 0; i < attemptModes.length; i += 1) {
        const mode = attemptModes[i];
        const candidate = await runs.timelineEvents(
          runId,
          buildTimelineQueryParams({
            types: currentApiTypes,
            statuses: currentApiStatuses,
            limit: 100,
            order: 'desc',
            cursor,
            cursorParamMode: mode,
          }),
        );
        if (!isNonAdvancingPage(candidate, cursor)) {
          response = candidate;
          successfulMode = mode;
          break;
        }
      }

      if (!response) {
        setOlderCursor(null);
        return;
      }

      loadOlderCursorParamModeRef.current = successfulMode ?? loadOlderCursorParamModeRef.current;

      const items = response.items ?? [];
      if (response.nextCursor) {
        setOlderCursor(response.nextCursor);
      } else {
        setOlderCursor(null);
      }

      if (items.length > 0) {
        updateEventsState((prev) => mergeEvents(prev, items, latestEventFilters, latestStatusFilters, {
          context: {
            source: 'load-older',
            runId,
            filters: { eventFilters: latestEventFilters, statusFilters: latestStatusFilters },
            cursor,
            mode: 'MERGE',
          },
        }), { setCursor: false });
      }
    } catch (error) {
      setLoadOlderError(error instanceof Error ? error.message : 'Failed to load older events');
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [olderCursor, runId, updateEventsState]);

  useEffect(() => {
    if (!runId) return;
    const room = `run:${runId}`;
    graphSocket.subscribe([room]);

    const offEvent = graphSocket.onRunEvent(({ runId: incomingRunId, event }) => {
      if (incomingRunId !== runId) return;
      const latestEventFilters = eventFiltersRef.current;
      const latestStatusFilters = statusFiltersRef.current;
      const cursor = toCursor(event);
      graphSocket.setRunCursor(runId, cursor);
      updateEventsState((prev) => mergeEvents(prev, [event], latestEventFilters, latestStatusFilters, {
        context: {
          source: 'socket-event',
          runId,
          filters: { eventFilters: latestEventFilters, statusFilters: latestStatusFilters },
          cursor,
          mode: 'MERGE',
        },
      }));
      setCursor(cursor);
      void refetchSummary();
    });

    const offStatus = graphSocket.onRunStatusChanged(({ run }) => {
      if (run.id === runId) void refetchSummary();
    });

    const offReconnect = graphSocket.onReconnected(() => {
      void fetchSinceCursor();
      void refetchSummary();
    });

    return () => {
      offEvent();
      offStatus();
      offReconnect();
      graphSocket.unsubscribe([room]);
    };
  }, [runId, updateEventsState, setCursor, fetchSinceCursor, refetchSummary]);

  const selectEvent = useCallback(
    (eventId: string) => {
      setSelectedEventId(eventId);
      updateSearchParams((params) => {
        params.set('eventId', eventId);
        params.set('follow', followRef.current ? 'true' : 'false');
      });
    },
    [updateSearchParams],
  );

  const clearSelection = useCallback(() => {
    setSelectedEventId(null);
    updateSearchParams((params) => {
      params.delete('eventId');
    });
  }, [updateSearchParams]);

  useEffect(() => {
    if (!events.length) {
      if (!eventsQuery.isFetching && selectedEventId) {
        clearSelection();
      }
      return;
    }

    if (followRef.current) {
      const latestEvent = events[events.length - 1];
      if (latestEvent && latestEvent.id !== selectedEventId) {
        selectEvent(latestEvent.id);
      }
      return;
    }

    if (!selectedEventId) return;
    const exists = events.some((event) => event.id === selectedEventId);
    if (!exists && !eventsQuery.isFetching) {
      clearSelection();
    }
  }, [events, eventsQuery.isFetching, selectedEventId, selectEvent, clearSelection]);

  const handleSelectEvent = useCallback(
    (eventId: string) => {
      if (followRef.current) {
        commitFollow(false);
      }
      selectEvent(eventId);
    },
    [commitFollow, selectEvent],
  );

  const handleFollowingChange = useCallback(
    (value: boolean) => {
      commitFollow(value);
      if (value) {
        const latest = events[events.length - 1];
        if (latest) selectEvent(latest.id);
      }
    },
    [commitFollow, events, selectEvent],
  );

  const handleEventFiltersChange = useCallback((filters: EventFilter[]) => {
    if (filters.length === 0) {
      setEventFilters([]);
      return;
    }
    setEventFilters(normalizeEventFilters(filters));
  }, []);

  const handleStatusFiltersChange = useCallback((filters: StatusFilter[]) => {
    if (filters.length === 0) {
      setStatusFilters([]);
      return;
    }
    setStatusFilters(normalizeStatusFilters(filters));
  }, []);

  const handleRefreshEvents = useCallback(() => {
    void eventsQuery.refetch();
  }, [eventsQuery]);

  const screenEvents = useMemo<RunEvent[]>(() => events.map((event) => mapTimelineEventToRunEvent(event)), [events]);
  const tokens = useMemo(() => aggregateLlmUsage(events), [events]);
  const stats = useMemo(() => buildStatistics(summaryQuery.data), [summaryQuery.data]);
  const runStatus: Status = mapRunSummaryStatusToScreenStatus(summaryQuery.data?.status);
  const duration = deriveDuration(summaryQuery.data);
  const createdAt = summaryQuery.data?.createdAt ?? new Date().toISOString();

  const statistics = useMemo(
    () => ({
      totalEvents: stats.totalEvents,
      messages: stats.messages,
      llm: stats.llm,
      tools: stats.tools,
      summaries: stats.summaries,
    }),
    [stats],
  );

  const baseErrorMessage = eventsQuery.error instanceof Error ? eventsQuery.error.message : 'Failed to load events';
  const fatalError = eventsQuery.isError && events.length === 0 ? baseErrorMessage : null;

  const listErrorMessages: string[] = [];
  if (eventsQuery.isError && events.length > 0) {
    listErrorMessages.push(baseErrorMessage);
  }
  if (loadOlderError) {
    listErrorMessages.push(loadOlderError);
  }
  const listErrorMessage = listErrorMessages.length > 0 ? listErrorMessages.join(' • ') : null;

  const isInitialLoading = eventsQuery.isFetching && events.length === 0;
  const isRefreshingEvents = eventsQuery.isFetching && events.length > 0;
  const isEmpty = !isInitialLoading && screenEvents.length === 0;

  const runIdForScreen = runId ?? '';

  return (
    <RunScreen
      runId={runIdForScreen}
      status={runStatus}
      createdAt={createdAt}
      duration={duration}
      statistics={statistics}
      tokens={tokens}
      events={screenEvents}
      selectedEventId={selectedEventId}
      isFollowing={follow}
      eventFilters={eventFilters}
      statusFilters={statusFilters}
      tokensPopoverOpen={tokensPopoverOpen}
      runsPopoverOpen={runsPopoverOpen}
      hasMoreEvents={Boolean(olderCursor)}
      isLoadingMoreEvents={loadingOlder}
      isLoading={isInitialLoading}
      isEmpty={isEmpty}
      error={fatalError ?? undefined}
      listErrorMessage={listErrorMessage ?? undefined}
      onSelectEvent={handleSelectEvent}
      onFollowingChange={handleFollowingChange}
      onEventFiltersChange={handleEventFiltersChange}
      onStatusFiltersChange={handleStatusFiltersChange}
      onTokensPopoverOpenChange={setTokensPopoverOpen}
      onRunsPopoverOpenChange={setRunsPopoverOpen}
      onLoadMoreEvents={olderCursor ? loadOlderEvents : undefined}
      onRefreshEvents={handleRefreshEvents}
      isRefreshingEvents={isRefreshingEvents}
      onTerminate={handleTerminate}
      onBack={threadId ? () => navigate(`/agents/threads/${threadId}`) : undefined}
      isDesktopLayout={isMdUp}
      onClearSelection={clearSelection}
    />
  );
}
