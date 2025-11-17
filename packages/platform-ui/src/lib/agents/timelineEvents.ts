import type { RunTimelineEvent } from '@/api/types/agents';

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function compareTimelineEvents(a: RunTimelineEvent, b: RunTimelineEvent): number {
  const timeDiff = parseTimestamp(a.ts) - parseTimestamp(b.ts);
  if (timeDiff !== 0) return timeDiff;
  const lexical = a.ts.localeCompare(b.ts);
  if (lexical !== 0) return lexical;
  return a.id.localeCompare(b.id);
}

export function sortAndDedupeTimelineEvents(entries: RunTimelineEvent[]): RunTimelineEvent[] {
  if (entries.length <= 1) return entries.slice();
  const byId = new Map<string, RunTimelineEvent>();
  for (const item of entries) {
    byId.set(item.id, item);
  }
  const unique = Array.from(byId.values());
  unique.sort(compareTimelineEvents);
  return unique;
}

export function mergeTimelineEvents(
  existing: RunTimelineEvent[],
  incoming: RunTimelineEvent[],
  options?: { preferIncoming?: boolean },
): RunTimelineEvent[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return sortAndDedupeTimelineEvents(incoming);
  if (options?.preferIncoming) {
    return sortAndDedupeTimelineEvents([...incoming, ...existing]);
  }
  return sortAndDedupeTimelineEvents([...existing, ...incoming]);
}
