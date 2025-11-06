import { tracingHttp, asData } from '@/api/http';
import type { SpanDoc } from '@/api/types/tracing';

export async function fetchSpansInRange(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const res = await asData<{ items: SpanDoc[] }>(tracingHttp.get<{ items: SpanDoc[] }>(`/v1/spans`, { params: { from: fromIso, to: toIso } }));
  return res.items || [];
}

export async function fetchRunningSpansFromTo(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const res = await asData<{ items: SpanDoc[] }>(tracingHttp.get<{ items: SpanDoc[] }>(`/v1/spans`, { params: { from: fromIso, to: toIso, status: 'running' } }));
  return res.items || [];
}
