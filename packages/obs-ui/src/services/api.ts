import { SpanDoc, LogDoc } from '../types';

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
