// Minimal tracing API client for platform-ui
// Defaults: VITE_TRACING_SERVER_URL=http://localhost:4319

export interface SpanDoc {
  _id?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  label: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  startTime: string;
  endTime?: string;
  completed: boolean;
  lastUpdate: string;
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attrs?: Record<string, unknown> }>;
  rev: number;
  idempotencyKeys: string[];
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
  threadId?: string;
}

const TRACING_BASE: string = import.meta.env.VITE_TRACING_SERVER_URL || 'http://localhost:4319';

export function getTracingBaseUrl(): string {
  return TRACING_BASE;
}

export async function fetchSpansInRange(params: { from: string; to: string; label?: string; limit?: number; cursor?: string; sort?: 'lastUpdate' | 'startTime' } ): Promise<{ items: SpanDoc[]; nextCursor?: string }> {
  const usp = new URLSearchParams();
  usp.set('from', params.from);
  usp.set('to', params.to);
  if (params.label) usp.set('label', params.label);
  usp.set('limit', String(params.limit ?? 500));
  if (params.cursor) usp.set('cursor', params.cursor);
  if (params.sort) usp.set('sort', params.sort);
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tracing spans');
  return res.json();
}

// Convenience: fetch running spans within a window
export async function fetchRunningSpansFromTo(from: string, to: string): Promise<SpanDoc[]> {
  const usp = new URLSearchParams();
  usp.set('status', 'running');
  usp.set('from', from);
  usp.set('to', to);
  usp.set('sort', 'lastUpdate');
  usp.set('limit', '5000');
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch running spans');
  const body = (await res.json()) as { items: SpanDoc[] };
  return body.items || [];
}
