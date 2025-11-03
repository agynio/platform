// Tracing API helpers (centralized)
export type SpanDoc = {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, unknown>;
};

export function getTracingBase(): string {
  // In platform-ui only, read env var via ImportMeta; no global any.
  const env: ImportMetaEnv | Record<string, string> =
    typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env
      ? (import.meta as ImportMeta).env
      : {};
  return (env as ImportMetaEnv).VITE_TRACING_SERVER_URL || 'http://localhost:4319';
}

export async function fetchSpansInRange(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const usp = new URLSearchParams({ from: fromIso, to: toIso });
  const TRACING_BASE = getTracingBase();
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.items as SpanDoc[]) || [];
}

export async function fetchRunningSpansFromTo(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const usp = new URLSearchParams({ from: fromIso, to: toIso, status: 'running' });
  const TRACING_BASE = getTracingBase();
  const res = await fetch(`${TRACING_BASE}/v1/spans?${usp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.items as SpanDoc[]) || [];
}
