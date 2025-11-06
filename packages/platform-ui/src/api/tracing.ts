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

export function getTracingBase(override?: string): string {
  if (override) return override;
  return config.tracingServerUrl;
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
