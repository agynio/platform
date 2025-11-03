// Tracing API helpers (centralized)
export type SpanDoc = {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, unknown>;
};

// Prefer runtime-configured serverUrl from tracing-ui when available
import { getServerUrl as getObsServerUrl } from '@agyn/tracing-ui/src/config';

export function getTracingBase(override?: string): string {
  if (override) return override;
  try {
    // Obs UI provider sets this at runtime; throws if not configured
    return getObsServerUrl();
  } catch {
    /* fallthrough to env */
  }
  // In platform-ui only, read env var via ImportMeta first, then Node env
  let viteUrl: string | undefined;
  try {
    const env: ImportMetaEnv | Record<string, string> =
      typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env
        ? (import.meta as ImportMeta).env
        : {};
    viteUrl = (env as ImportMetaEnv).VITE_TRACING_SERVER_URL as string | undefined;
  } catch {
    viteUrl = undefined;
  }
  if (viteUrl) return viteUrl;
  try {
    const nodeUrl = typeof process !== 'undefined' ? (process.env?.TRACING_SERVER_URL as string | undefined) : undefined;
    if (nodeUrl) return nodeUrl;
  } catch {
    /* ignore */
  }
  throw new Error('Tracing base not configured. Set VITE_TRACING_SERVER_URL or pass override.');
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
