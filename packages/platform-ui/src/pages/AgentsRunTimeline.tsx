import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RunTimelineEventListItem } from '@/components/agents/RunTimelineEventListItem';
import { RunTimelineEventDetails } from '@/components/agents/RunTimelineEventDetails';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { runs } from '@/api/modules/runs';
import { graphSocket } from '@/lib/graph/socket';
import type { RunEventStatus, RunEventType, RunTimelineEvent, RunTimelineEventsCursor } from '@/api/types/agents';
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

function mergeEvents(
  prev: RunTimelineEvent[],
  incoming: RunTimelineEvent[],
  types: RunEventType[],
  statuses: RunEventStatus[],
): RunTimelineEvent[] {
  if (incoming.length === 0) return prev;
  const next = [...prev];
  for (const event of incoming) {
    const idx = next.findIndex((existing) => existing.id === event.id);
    const include = matchesFilters(event, types, statuses);
    if (idx >= 0) {
      if (include) {
        next[idx] = event;
      } else {
        next.splice(idx, 1);
      }
    } else if (include) {
      next.push(event);
    }
  }
  return sortEvents(next);
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
  const eventsQuery = useRunTimelineEvents(runId, { types: apiTypes, statuses: apiStatuses });
  const [events, setEvents] = useState<RunTimelineEvent[]>([]);
  const cursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const catchUpRef = useRef<Promise<unknown> | null>(null);
  const canTerminate = summaryData?.status === 'running';

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
    (updater: (prev: RunTimelineEvent[]) => RunTimelineEvent[]) => {
      setEvents((prev) => {
        const next = updater(prev);
        const latest = next[next.length - 1];
        if (latest) setCursor(toCursor(latest));
        return next;
      });
    },
    [setCursor],
  );

  useEffect(() => {
    setEvents([]);
    if (!runId) {
      cursorRef.current = null;
      return;
    }
    cursorRef.current = null;
    graphSocket.setRunCursor(runId, null, { force: true });
  }, [runId]);

  useEffect(() => {
    if (!eventsQuery.data) return;
    const sorted = sortEvents(eventsQuery.data.items ?? []);
    setEvents(sorted);
    const latest = sorted[sorted.length - 1];
    setCursor(latest ? toCursor(latest) : null, { force: true });
  }, [eventsQuery.data, setCursor]);

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
        const response = await runs.timelineEvents(runId, {
          types: apiTypes.length > 0 ? apiTypes.join(',') : undefined,
          cursorTs: cursor.ts,
          cursorId: cursor.id,
        });
        const items = response.items ?? [];
        if (items.length > 0) {
          updateEventsState((prev) => mergeEvents(prev, items, selectedTypes, selectedStatuses));
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
  }, [runId, apiTypes, selectedTypes, selectedStatuses, eventsQuery, updateEventsState, setCursor]);

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
      updateEventsState((prev) => mergeEvents(prev, [event], selectedTypes, selectedStatuses));
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

  useEffect(() => {
    const itemsCount = eventsQuery.data?.items?.length ?? 0;
    if (!events.length) {
      if (selectedEventId && !eventsQuery.isFetching && itemsCount === 0) {
        clearSelection();
      }
      return;
    }
    if (selectedEventId) {
      const exists = events.some((evt) => evt.id === selectedEventId);
      if (!exists && isMdUp && !eventsQuery.isFetching) {
        selectEvent(events[0].id, { focus: false });
      }
      return;
    }
    if (isMdUp && !eventsQuery.isFetching) {
      selectEvent(events[0].id, { focus: false });
    }
  }, [events, selectedEventId, selectEvent, clearSelection, isMdUp, eventsQuery.isFetching, eventsQuery.data]);

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
