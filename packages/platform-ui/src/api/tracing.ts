// Tracing API helpers (centralized)
export type SpanDoc = {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, unknown>;
};

// Additional realtime payload extras potentially included by socket events
// These fields are optional and may not be present on historical fetches.
export type SpanExtras = {
  status?: string;
  lastUpdate?: string; // ISO timestamp
  nodeId?: string;
  endedAt?: string;
};

// Event payload type for realtime span_upsert events
export type SpanEventPayload = SpanDoc & Partial<SpanExtras> & {
  attributes?: Record<string, unknown>;
};

import { config } from '@/config';

// Resolve tracing base URL from env or config.apiBaseUrl
// Prefer explicit VITE_TRACING_SERVER_URL; otherwise derive from apiBaseUrl
export function getTracingBase(override?: string): string {
  if (override) return override;
  const env = (import.meta as { env?: Record<string, unknown> } | undefined)?.env || {};
  const tracing = env?.VITE_TRACING_SERVER_URL as string | undefined;
  const base = tracing && tracing.length > 0
    ? tracing
    : `${config.apiBaseUrl}/tracing`;
  // Normalize trailing slash
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export async function fetchSpansInRange(fromIso: string, toIso: string, base?: string): Promise<SpanDoc[]> {
  const usp = new URLSearchParams({ from: fromIso, to: toIso });
  const TRACING_BASE = getTracingBase(base);
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.items as SpanDoc[]) || [];
}

export async function fetchRunningSpansFromTo(fromIso: string, toIso: string, base?: string): Promise<SpanDoc[]> {
  const usp = new URLSearchParams({ from: fromIso, to: toIso, status: 'running' });
  const TRACING_BASE = getTracingBase(base);
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.items as SpanDoc[]) || [];
}
