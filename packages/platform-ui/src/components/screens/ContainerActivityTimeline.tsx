import { useMemo } from 'react';
import { useContainerEvents } from '@/api/hooks/containerEvents';
import type { InfiniteData } from '@tanstack/react-query';
import type { ContainerEventItem, ContainerEventsResponse } from '@/api/modules/containers';

type ContainerActivityTimelineProps = {
  containerId: string;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

const formatLabel = (event: { reason: string | null; eventType: string }): string => {
  return event.reason && event.reason.trim() ? event.reason : event.eventType;
};

const formatMetadata = (event: {
  exitCode: number | null;
  signal: string | null;
  health: string | null;
  message: string | null;
}): string | null => {
  const parts: string[] = [];
  if (typeof event.exitCode === 'number') parts.push(`exitCode=${event.exitCode}`);
  if (event.signal) parts.push(`signal=${event.signal}`);
  if (event.health) parts.push(`health=${event.health}`);
  if (event.message) parts.push(event.message);
  return parts.length ? parts.join(' · ') : null;
};

export function ContainerActivityTimeline({ containerId }: ContainerActivityTimelineProps) {
  const query = useContainerEvents(containerId, true);

  const events = useMemo<ContainerEventItem[]>(() => {
    const data: InfiniteData<ContainerEventsResponse> | undefined = query.data;
    if (!data) return [];
    return data.pages.flatMap((page: ContainerEventsResponse) => page.items);
  }, [query.data]);

  if (query.isLoading) {
    return <div className="text-xs text-[var(--agyn-text-subtle)]">Loading activity…</div>;
  }

  if (query.isError) {
    return (
      <div className="flex items-center gap-3 text-xs text-[var(--agyn-status-failed)]">
        <span>Failed to load activity.</span>
        <button
          type="button"
          className="rounded border border-[var(--agyn-status-failed)] px-2 py-1 text-[var(--agyn-status-failed)] hover:bg-[var(--agyn-status-failed)]/10"
          onClick={() => query.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="text-xs text-[var(--agyn-text-subtle)]">No activity recorded yet.</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-[var(--agyn-border-subtle)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[var(--agyn-dark)]">Activity</h4>
        {query.isFetching && !query.isFetchingNextPage ? (
          <span className="text-[10px] uppercase text-[var(--agyn-text-subtle)] tracking-wide">Refreshing…</span>
        ) : null}
      </div>
      <ul className="space-y-3">
        {events.map((event: ContainerEventItem) => {
          const timestamp = formatTimestamp(event.createdAt);
          const label = formatLabel(event);
          const metadata = formatMetadata(event);
          return (
            <li key={event.id} className="relative pl-4 border-l border-[var(--agyn-border-subtle)]">
              <span className="absolute -left-1 top-1 w-2 h-2 rounded-full bg-[var(--agyn-blue)]" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-[10px] font-mono text-[var(--agyn-text-subtle)]" title={event.createdAt}>
                    {timestamp}
                  </span>
                  <span className="text-sm font-medium text-[var(--agyn-dark)]">{label}</span>
                </div>
                {metadata ? (
                  <div className="text-xs text-[var(--agyn-text-subtle)] break-words">{metadata}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          className="mt-4 inline-flex items-center rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)] transition-colors"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load older activity'}
        </button>
      ) : null}
    </div>
  );
}
