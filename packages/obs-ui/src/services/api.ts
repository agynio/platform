import { SpanDoc, LogDoc } from '../types';
import type { TimeRange } from '../components/TimeRangeSelector';

const BASE_URL = (import.meta as any).env?.VITE_OBS_SERVER_URL || 'http://localhost:4319';

export async function fetchTraces(): Promise<Array<{ traceId: string; root?: SpanDoc; spanCount: number; failedCount: number; lastUpdate: string }>> {
  // We only have spans endpoint; derive traces by grouping spans.latest
  const spans = await fetchSpans();
  const byTrace: Record<string, SpanDoc[]> = {};
  spans.forEach(s => { (byTrace[s.traceId] ||= []).push(s); });
  return Object.entries(byTrace).map(([traceId, arr]) => {
    const root = arr.find(s => !s.parentSpanId);
    const lastUpdate = arr.map(s => s.lastUpdate).sort().reverse()[0];
    const failedCount = arr.filter(s => s.status === 'error').length;
    return { traceId, root, spanCount: arr.length, failedCount, lastUpdate };
  }).sort((a,b) => b.lastUpdate.localeCompare(a.lastUpdate));
}

export async function fetchTrace(traceId: string): Promise<SpanDoc[]> {
  const spans = await fetchSpans();
  return spans.filter(s => s.traceId === traceId);
}

export async function fetchThread(threadId: string): Promise<SpanDoc[]> {
  const spans = await fetchSpans();
  const byParent: Record<string, SpanDoc[]> = {};
  for (const s of spans) {
    if (s.parentSpanId) (byParent[s.parentSpanId] ||= []).push(s);
  }
  const isThreadSpan = (s: SpanDoc) => (s.threadId || (s.attributes?.['threadId'] as string | undefined)) === threadId;
  const seeds = spans.filter(isThreadSpan);
  if (!seeds.length) return [];
  const included: Record<string, SpanDoc> = {};
  const stack = [...seeds];
  for (const seed of seeds) included[seed.spanId] = seed;
  while (stack.length) {
    const current = stack.pop()!;
    const children = byParent[current.spanId] || [];
    for (const c of children) {
      if (!included[c.spanId]) {
        included[c.spanId] = c;
        stack.push(c);
      }
    }
  }
  return Object.values(included);
}

export async function fetchSpans(opts: { limit?: number; cursor?: string } = {}): Promise<SpanDoc[]> {
  const usp = new URLSearchParams();
  // Default to large limit (5000) now that server supports it, unless caller overrides
  usp.set('limit', String(opts.limit ?? 5000));
  if (opts.cursor) usp.set('cursor', opts.cursor);
  const r = await fetch(BASE_URL + '/v1/spans' + (usp.toString() ? `?${usp.toString()}` : ''));
  if (!r.ok) throw new Error('Failed to fetch spans');
  const data = await r.json();
  return data.items || [];
}

export async function fetchLogs(params: { traceId?: string; spanId?: string; limit?: number } = {}): Promise<LogDoc[]> {
  const usp = new URLSearchParams();
  if (params.traceId) usp.set('traceId', params.traceId);
  if (params.spanId) usp.set('spanId', params.spanId);
  if (params.limit) usp.set('limit', String(params.limit));
  const r = await fetch(BASE_URL + '/v1/logs' + (usp.toString() ? '?' + usp.toString() : ''));
  if (!r.ok) throw new Error('Failed to fetch logs');
  const data = await r.json();
  return data.items || [];
}

// New: metrics errors-by-tool
export interface ErrorsByToolItem { label: string; count: number }
export async function fetchErrorsByTool(range: TimeRange, opts: { field?: 'lastUpdate'|'startTime'; limit?: number } = {}): Promise<{ items: ErrorsByToolItem[]; from: string; to: string }> {
  const usp = new URLSearchParams();
  usp.set('from', range.from);
  usp.set('to', range.to);
  if (opts.field) usp.set('field', opts.field);
  if (opts.limit) usp.set('limit', String(opts.limit));
  const url = BASE_URL + '/v1/metrics/errors-by-tool' + (usp.toString() ? `?${usp}` : '');
  const r = await fetch(url);
  if (r.status === 404) {
    // Fallback: client-side aggregation using /v1/spans
    const maxWindowMs = 24 * 60 * 60 * 1000; // 24h cap to avoid heavy pulls
    const fromMs = Date.parse(range.from); const toMs = Date.parse(range.to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) throw new Error('Invalid time range');
    if (toMs - fromMs > maxWindowMs) {
      console.warn('Narrowing client-side fallback range to last 24h to avoid heavy pull');
    }
    const narrowed: TimeRange = (toMs - fromMs > maxWindowMs)
      ? { from: new Date(toMs - maxWindowMs).toISOString(), to: new Date(toMs).toISOString() }
      : range;
    const spansRes = await fetchSpansInRange(narrowed, { status: 'error', limit: 2000 });
    const spans = spansRes.items;
    const counts: Record<string, number> = {};
    for (const s of spans) {
      if (s.label && s.label.startsWith('tool:')) counts[s.label] = (counts[s.label] || 0) + 1;
    }
    const items = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count).slice(0, opts.limit ?? 50);
    return { items, from: narrowed.from, to: narrowed.to };
  }
  if (!r.ok) throw new Error('Failed to fetch metrics');
  const data = await r.json();
  return data;
}

export async function fetchSpansInRange(range: TimeRange, params: { status?: 'running'|'ok'|'error'|'cancelled'; label?: string; limit?: number; cursor?: string; sort?: 'lastUpdate'|'startTime' } = {}): Promise<{ items: SpanDoc[]; nextCursor?: string }> {
  const usp = new URLSearchParams();
  usp.set('from', range.from);
  usp.set('to', range.to);
  usp.set('limit', String(params.limit ?? 50));
  if (params.status) usp.set('status', params.status);
  if (params.label) usp.set('label', params.label);
  if (params.cursor) usp.set('cursor', params.cursor);
  if (params.sort) usp.set('sort', params.sort);
  const r = await fetch(BASE_URL + '/v1/spans' + (usp.toString() ? `?${usp.toString()}` : ''));
  if (!r.ok) throw new Error('Failed to fetch spans');
  const data = await r.json();
  return data;
}
