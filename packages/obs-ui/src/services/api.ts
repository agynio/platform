import { SpanDoc } from '../types';

const BASE_URL = (import.meta as any).env?.VITE_OBS_SERVER_URL || 'http://localhost:4319';

export async function fetchTraces(): Promise<Array<{ traceId: string; root?: SpanDoc; spanCount: number; lastUpdate: string }>> {
  // We only have spans endpoint; derive traces by grouping spans.latest
  const spans = await fetchSpans();
  const byTrace: Record<string, SpanDoc[]> = {};
  spans.forEach(s => { (byTrace[s.traceId] ||= []).push(s); });
  return Object.entries(byTrace).map(([traceId, arr]) => {
    const root = arr.find(s => !s.parentSpanId);
    const lastUpdate = arr.map(s => s.lastUpdate).sort().reverse()[0];
    return { traceId, root, spanCount: arr.length, lastUpdate };
  }).sort((a,b) => b.lastUpdate.localeCompare(a.lastUpdate));
}

export async function fetchTrace(traceId: string): Promise<SpanDoc[]> {
  const spans = await fetchSpans();
  return spans.filter(s => s.traceId === traceId);
}

export async function fetchSpans(): Promise<SpanDoc[]> {
  const r = await fetch(BASE_URL + '/v1/spans');
  if (!r.ok) throw new Error('Failed to fetch spans');
  const data = await r.json();
  return data.items || [];
}
