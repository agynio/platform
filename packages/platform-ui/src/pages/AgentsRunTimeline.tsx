import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RunTimelineEventCard } from '@/components/agents/RunTimelineEventCard';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { graphSocket } from '@/lib/graph/socket';
import type { RunEventStatus, RunEventType, RunTimelineEvent } from '@/api/types/agents';

const EVENT_TYPES: RunEventType[] = ['invocation_message', 'injection', 'llm_call', 'tool_execution', 'summarization'];
const STATUS_TYPES: RunEventStatus[] = ['pending', 'running', 'success', 'error', 'cancelled'];

export function AgentsRunTimeline() {
  const params = useParams<{ threadId: string; runId: string }>();
  const threadId = params.threadId;
  const runId = params.runId;
  const navigate = useNavigate();

  const [selectedTypes, setSelectedTypes] = useState<RunEventType[]>(EVENT_TYPES);
  const [selectedStatuses, setSelectedStatuses] = useState<RunEventStatus[]>([]);

  // Reset filters when run changes
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
          if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
          return a.ts.localeCompare(b.ts);
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
        <div className="max-w-5xl mx-auto space-y-4">
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
                  disabled={eventsQuery.isFetching || isDefaultFilters}
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

          <section className="space-y-3" aria-live="polite">
            {events.length === 0 && !eventsQuery.isFetching ? (
              <div className="text-sm text-gray-600 border rounded-md bg-white p-4">No events for selected filters.</div>
            ) : (
              events.map((event) => <RunTimelineEventCard key={event.id} event={event} />)
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
