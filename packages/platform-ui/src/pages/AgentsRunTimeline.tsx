import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RunTimelineEventListItem } from '@/components/agents/RunTimelineEventListItem';
import { RunTimelineEventDetails } from '@/components/agents/RunTimelineEventDetails';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { graphSocket } from '@/lib/graph/socket';
import type { RunEventStatus, RunEventType, RunTimelineEvent } from '@/api/types/agents';
import { getEventTypeLabel } from '@/components/agents/runTimelineFormatting';

const EVENT_TYPES: RunEventType[] = ['invocation_message', 'injection', 'llm_call', 'tool_execution', 'summarization'];
const STATUS_TYPES: RunEventStatus[] = ['pending', 'running', 'success', 'error', 'cancelled'];

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

  useEffect(() => {
    setSelectedTypes(EVENT_TYPES);
    setSelectedStatuses([]);
  }, [runId]);

  const apiTypes = selectedTypes.length === EVENT_TYPES.length ? [] : selectedTypes;
  const apiStatuses = selectedStatuses;

  const summaryQuery = useRunTimelineSummary(runId);
  const eventsQuery = useRunTimelineEvents(runId, { types: apiTypes, statuses: apiStatuses });
  const [events, setEvents] = useState<RunTimelineEvent[]>([]);

  useEffect(() => {
    if (eventsQuery.data?.items) setEvents(eventsQuery.data.items);
  }, [eventsQuery.data]);

  useEffect(() => {
    if (!runId) return;
    const room = `run:${runId}`;
    graphSocket.subscribe([room]);
    const off = graphSocket.onRunEvent(({ runId: incomingRunId, event }) => {
      if (incomingRunId !== runId) return;
      if (selectedTypes.length > 0 && !selectedTypes.includes(event.type)) return;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(event.status)) return;
      setEvents((prev) => {
        const idx = prev.findIndex((e) => e.id === event.id);
        let next: RunTimelineEvent[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = event;
        } else {
          next = [...prev, event];
        }
        next.sort((a, b) => {
          const timeA = Date.parse(a.ts);
          const timeB = Date.parse(b.ts);
          if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) return timeA - timeB;
          if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) return a.id.localeCompare(b.id);
          const lexical = a.ts.localeCompare(b.ts);
          if (lexical !== 0) return lexical;
          return a.id.localeCompare(b.id);
        });
        return next;
      });
      summaryQuery.refetch();
    });
    const offStatus = graphSocket.onRunStatusChanged(({ run }) => {
      if (run.id === runId) summaryQuery.refetch();
    });
    const offReconnect = graphSocket.onReconnected(() => {
      summaryQuery.refetch();
      eventsQuery.refetch();
    });
    return () => {
      off();
      offStatus();
      offReconnect();
      graphSocket.unsubscribe([room]);
    };
  }, [runId, selectedTypes, selectedStatuses, summaryQuery, eventsQuery]);

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

  const summary = summaryQuery.data;
  const countsByType = summary
    ? typeFilters.map((entry) => ({ label: entry.label, count: summary.countsByType[entry.type] ?? 0 }))
    : [];

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
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-4">
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1 className="text-xl font-semibold">Run Timeline</h1>
        {threadId && (
          <Link to={`/agents/threads`} className="text-sm text-blue-600 hover:underline">
            Thread {threadId.slice(0, 8)}
          </Link>
        )}
        {runId && <span className="ml-auto text-sm text-gray-600">Run {runId.slice(0, 8)}</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <section className="border rounded-md bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <div className="text-sm font-semibold">Status</div>
                <div className="text-lg font-semibold">
                  {summary ? summary.status : summaryQuery.isLoading ? 'Loading…' : 'Unknown'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total events</div>
                <div className="text-lg font-semibold">{summary ? summary.totalEvents : '—'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">First event</div>
                <div className="text-sm">{summary?.firstEventAt ? new Date(summary.firstEventAt).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Last event</div>
                <div className="text-sm">{summary?.lastEventAt ? new Date(summary.lastEventAt).toLocaleString() : '—'}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-700">
              {countsByType.map((entry) => (
                <div key={entry.label} className="px-3 py-1 rounded-full bg-gray-100">
                  {entry.label}: {entry.count}
                </div>
              ))}
            </div>
          </section>

          <section className="border rounded-md bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <h2 className="text-sm font-semibold mr-2">Filter events</h2>
              {typeFilters.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  onClick={() => toggleType(entry.type)}
                  className={`px-3 py-1 text-xs rounded-full border ${entry.active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs uppercase tracking-wide text-gray-500">Statuses</span>
              {statusFilters.map((entry) => (
                <button
                  key={entry.status}
                  type="button"
                  onClick={() => toggleStatus(entry.status)}
                  className={`px-3 py-1 text-xs rounded-full border ${entry.active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  {entry.status}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1 text-xs border rounded bg-white hover:bg-gray-100"
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
                  className="px-3 py-1 text-xs border rounded bg-white hover:bg-gray-100"
                  onClick={() => eventsQuery.refetch()}
                  disabled={eventsQuery.isFetching}
                >
                  Refresh
                </button>
              </div>
            </div>
            {eventsQuery.isError && (
              <div className="mt-2 text-xs text-red-600">{(eventsQuery.error as Error)?.message ?? 'Failed to load events'}</div>
            )}
            {eventsQuery.isFetching && <div className="mt-2 text-xs text-gray-500">Loading events…</div>}
          </section>

          <section className="border rounded-md bg-white shadow-sm md:flex md:min-h-[420px]">
            <div className="flex flex-col md:w-80 md:flex-none md:border-r">
              <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Events</div>
              <div className="px-3 py-2 text-xs text-gray-500" aria-live="polite">
                {events.length === 0 && !eventsQuery.isFetching ? 'No events for selected filters.' : null}
              </div>
              <div
                ref={listRef}
                role="listbox"
                aria-label="Run events"
                aria-busy={eventsQuery.isFetching}
                aria-activedescendant={selectedEventId ? `run-event-option-${selectedEventId}` : undefined}
                tabIndex={0}
                onKeyDown={handleListKeyDown}
                className="flex-1 overflow-y-auto p-3 space-y-2 focus:outline-none"
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
            </div>
            <div className="hidden md:flex flex-1 flex-col">
              <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Details</div>
              <div className="flex-1 overflow-y-auto p-4">
                {selectedEvent ? (
                  <RunTimelineEventDetails event={selectedEvent} />
                ) : (
                  <div className="text-sm text-gray-500">Select an event to view details.</div>
                )}
              </div>
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
