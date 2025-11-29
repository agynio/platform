import { http, asData } from '@/api/http';
import type {
  RunMessageItem,
  RunMeta,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
  RunTimelineSummary,
  ToolOutputSnapshot,
} from '@/api/types/agents';

export type TimelineQueryParamsInput = {
  types?: string[];
  statuses?: string[];
  limit?: number;
  order?: 'asc' | 'desc';
  cursor?: RunTimelineEventsCursor | null;
  cursorParamMode?: 'both' | 'bracketed' | 'plain';
};

export function buildTimelineQueryParams(input: TimelineQueryParamsInput): Record<string, string | number> {
  const {
    types,
    statuses,
    limit,
    order,
    cursor,
    cursorParamMode,
  } = input;

  const params: Record<string, string | number> = {};

  if (Array.isArray(types) && types.length > 0) {
    params.types = types.join(',');
  }

  if (Array.isArray(statuses) && statuses.length > 0) {
    params.statuses = statuses.join(',');
  }

  if (typeof limit === 'number') {
    params.limit = limit;
  }

  if (order === 'asc' || order === 'desc') {
    params.order = order;
  }

  if (cursor && (cursor.ts || cursor.id)) {
    Object.assign(
      params,
      buildCursorParams({
        cursorTs: cursor.ts,
        cursorId: cursor.id,
        cursorParamMode,
      }),
    );
  }

  return params;
}

export type TimelineQueryParams = ReturnType<typeof buildTimelineQueryParams>;

export const runs = {
  listByThread: (threadId: string) => asData<{ items: RunMeta[] }>(
    http.get<{ items: RunMeta[] }>(`/api/agents/threads/${encodeURIComponent(threadId)}/runs`),
  ),
  messages: (runId: string, type: 'input' | 'injected' | 'output') =>
    asData<{ items: RunMessageItem[] }>(
      http.get<{ items: RunMessageItem[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/messages`, { params: { type } }),
    ),
  timelineSummary: (runId: string) =>
    asData<RunTimelineSummary>(http.get<RunTimelineSummary>(`/api/agents/runs/${encodeURIComponent(runId)}/summary`)),
  timelineEvents: (runId: string, params: TimelineQueryParams) =>
    asData<RunTimelineEventsResponse>(
      http.get<RunTimelineEventsResponse>(`/api/agents/runs/${encodeURIComponent(runId)}/events`, {
        params,
      }),
    ),
  toolOutputSnapshot: (
    runId: string,
    eventId: string,
    params?: { sinceSeq?: number; limit?: number; order?: 'asc' | 'desc' },
  ) =>
    asData<ToolOutputSnapshot>(
      http.get<ToolOutputSnapshot>(
        `/api/agents/runs/${encodeURIComponent(runId)}/events/${encodeURIComponent(eventId)}/output`,
        {
          params: {
            order: params?.order ?? 'asc',
            ...(params?.sinceSeq !== undefined ? { sinceSeq: params.sinceSeq } : {}),
            ...(params?.limit !== undefined ? { limit: params.limit } : {}),
          },
        },
      ),
    ),
  terminate: (runId: string) =>
    asData<{ ok: boolean }>(
      http.post<{ ok: boolean }>(`/api/agents/runs/${encodeURIComponent(runId)}/terminate`, {}),
    ),
};

function buildCursorParams(params: { cursorTs?: string; cursorId?: string; cursorParamMode?: 'both' | 'bracketed' | 'plain' }) {
  const { cursorTs, cursorId, cursorParamMode = 'both' } = params;
  const next: Record<string, string> = {};

  const includeBracketed = cursorParamMode === 'both' || cursorParamMode === 'bracketed';
  const includePlain = cursorParamMode === 'both' || cursorParamMode === 'plain';

  if (cursorTs) {
    if (includeBracketed) next['cursor[ts]'] = cursorTs;
    if (includePlain) next.cursorTs = cursorTs;
  }

  if (cursorId) {
    if (includeBracketed) next['cursor[id]'] = cursorId;
    if (includePlain) next.cursorId = cursorId;
  }

  return next;
}
