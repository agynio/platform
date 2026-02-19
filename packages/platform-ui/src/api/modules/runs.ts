import { http, asData } from '@/api/http';
import type {
  RunMessageItem,
  RunMeta,
  RunTimelineEventsResponse,
  RunTimelineSummary,
  RunTimelineTotalsResponse,
  ToolOutputSnapshot,
} from '@/api/types/agents';

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
  timelineEvents: (
    runId: string,
    params: {
      types?: string;
      statuses?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      cursorTs?: string;
      cursorId?: string;
      cursorParamMode?: 'both' | 'bracketed' | 'plain';
    },
  ) =>
    asData<RunTimelineEventsResponse>(
      http.get<RunTimelineEventsResponse>(`/api/agents/runs/${encodeURIComponent(runId)}/events`, {
        params: {
          types: params.types,
          statuses: params.statuses,
          limit: params.limit,
          order: params.order,
          ...buildCursorParams(params),
        },
      }),
    ),
  timelineEventTotals: (runId: string, params?: { types?: string; statuses?: string }) =>
    asData<RunTimelineTotalsResponse>(
      http.get<RunTimelineTotalsResponse>(`/api/agents/runs/${encodeURIComponent(runId)}/events/totals`, {
        params: {
          ...(params?.types ? { types: params.types } : {}),
          ...(params?.statuses ? { statuses: params.statuses } : {}),
        },
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
  const mode = params.cursorParamMode ?? 'both';
  const next: Record<string, string> = {};
  if (params.cursorTs) {
    if (mode !== 'plain') next['cursor[ts]'] = params.cursorTs;
    if (mode !== 'bracketed') next.cursorTs = params.cursorTs;
  }
  if (params.cursorId) {
    if (mode !== 'plain') next['cursor[id]'] = params.cursorId;
    if (mode !== 'bracketed') next.cursorId = params.cursorId;
  }
  return next;
}
