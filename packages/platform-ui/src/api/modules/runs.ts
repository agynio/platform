import { http, asData } from '@/api/http';
import type {
  RunMessageItem,
  RunMeta,
  RunTimelineEvent,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
  RunTimelineSummary,
} from '@/api/types/agents';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object') {
    return value as UnknownRecord;
  }
  return {};
}

function coerceCursor(cursorLike: unknown): RunTimelineEventsCursor | null {
  const candidate = toRecord(cursorLike);
  const tsRaw = candidate.ts ?? candidate.timestamp ?? candidate.tsIso;
  const idRaw = candidate.id ?? candidate.cursorId ?? candidate.eventId;
  if (typeof tsRaw === 'string' && typeof idRaw === 'string' && tsRaw && idRaw) {
    return { ts: tsRaw, id: idRaw };
  }
  return null;
}

function normalizeTimelineEventsResponse(raw: unknown): RunTimelineEventsResponse {
  const topLevel = toRecord(raw);

  const visited = new Set<UnknownRecord>();
  const queue: UnknownRecord[] = [topLevel];
  const candidates: UnknownRecord[] = [];

  const enqueue = (value: unknown) => {
    const record = toRecord(value);
    if (!record || visited.has(record)) return;
    if (Object.keys(record).length === 0) return;
    queue.push(record);
  };

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    candidates.push(current);

    enqueue(current.data);
    enqueue(current.page ?? current.pagination);

    const pageRecord = toRecord(current.page ?? current.pagination ?? {});
    if (Object.keys(pageRecord).length > 0) {
      enqueue(pageRecord.data);
    }
  }

  const pickArray = (getter: (candidate: UnknownRecord) => unknown): RunTimelineEvent[] | undefined => {
    for (const candidate of candidates) {
      const value = getter(candidate);
      if (Array.isArray(value)) return value as RunTimelineEvent[];
    }
    return undefined;
  };

  const items =
    pickArray((candidate) => candidate.items) ??
    pickArray((candidate) => candidate.events) ??
    (Array.isArray(topLevel.data) ? (topLevel.data as RunTimelineEvent[]) : undefined) ??
    [];

  const cursorCandidates: Array<RunTimelineEventsCursor | null> = [];
  for (const candidate of candidates) {
    cursorCandidates.push(
      coerceCursor(candidate.nextCursor) ??
        coerceCursor(candidate.next_cursor) ??
        coerceCursor(candidate.cursor) ??
        coerceCursor(candidate.next),
    );
  }

  const nextCursor = cursorCandidates.find((cursor): cursor is RunTimelineEventsCursor => cursor != null) ?? null;

  return {
    items,
    nextCursor,
  };
}

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
  timelineEvents: async (
    runId: string,
    params: {
      types?: string;
      statuses?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      cursor?: RunTimelineEventsCursor | null;
    },
  ) => {
    const raw = await http.get<unknown>(`/api/agents/runs/${encodeURIComponent(runId)}/events`, {
      params: {
        types: params.types,
        statuses: params.statuses,
        limit: params.limit,
        order: params.order,
        ...(params.cursor ? { 'cursor[ts]': params.cursor.ts, 'cursor[id]': params.cursor.id } : {}),
      },
    });
    return normalizeTimelineEventsResponse(raw);
  },
};
