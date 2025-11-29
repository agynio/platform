import { useQuery } from '@tanstack/react-query';
import { buildTimelineQueryParams, runs } from '@/api/modules/runs';
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
  const typesKey = filters.types.join('|');
  const statusesKey = filters.statuses.join('|');
  const limitKey = typeof filters.limit === 'number' ? filters.limit : null;
  const orderKey = filters.order ?? null;
  const cursorTsKey = filters.cursor?.ts ?? null;
  const cursorIdKey = filters.cursor?.id ?? null;

  return useQuery({
    enabled: !!runId,
    queryKey: ['agents', 'runs', runId, 'timeline', 'events', typesKey, statusesKey, limitKey, orderKey, cursorTsKey, cursorIdKey],
    queryFn: () =>
      runs.timelineEvents(
        runId as string,
        buildTimelineQueryParams({
          types: filters.types,
          statuses: filters.statuses,
          limit: filters.limit,
          order: filters.order,
          cursor: filters.cursor ?? null,
          cursorParamMode: 'both',
        }),
      ),
    refetchOnWindowFocus: false,
  });
}
