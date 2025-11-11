import { useQuery } from '@tanstack/react-query';
import { runs } from '@/api/modules/runs';
import type { RunTimelineEventsCursor } from '@/api/types/agents';

export function useThreadRuns(threadId: string | undefined) {
  return useQuery({
    enabled: !!threadId,
    queryKey: ['agents', 'threads', threadId, 'runs'],
    queryFn: () => runs.listByThread(threadId as string),
  });
}

export function useRunMessages(runId: string | undefined, type: 'input' | 'injected' | 'output') {
  return useQuery({
    enabled: !!runId,
    queryKey: ['agents', 'runs', runId, 'messages', type],
    queryFn: () => runs.messages(runId as string, type),
  });
}

export function useRunTimelineSummary(runId: string | undefined) {
  return useQuery({
    enabled: !!runId,
    queryKey: ['agents', 'runs', runId, 'timeline', 'summary'],
    queryFn: () => runs.timelineSummary(runId as string),
    refetchOnWindowFocus: false,
  });
}

export function useRunTimelineEvents(
  runId: string | undefined,
  filters: { types: string[]; statuses: string[]; limit?: number; order?: 'asc' | 'desc'; cursor?: RunTimelineEventsCursor | null },
) {
  return useQuery({
    enabled: !!runId,
    queryKey: ['agents', 'runs', runId, 'timeline', 'events', filters],
    queryFn: () =>
      runs.timelineEvents(runId as string, {
        types: filters.types.length > 0 ? filters.types.join(',') : undefined,
        statuses: filters.statuses.length > 0 ? filters.statuses.join(',') : undefined,
        limit: filters.limit,
        order: filters.order,
        cursorOrdinal: filters.cursor?.ordinal,
        cursorId: filters.cursor?.id,
      }),
    refetchOnWindowFocus: false,
  });
}
