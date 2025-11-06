// Tracing realtime socket client for platform-ui (span_upsert events)
import { io, type Socket } from 'socket.io-client';
import type { SpanDoc, SpanExtras } from '@/api/types/tracing';
import { config } from '@/config';

const TRACING_BASE: string | undefined = config.tracing.serverUrl;

export type SpanEventPayload = SpanDoc & Partial<SpanExtras> & { attributes?: Record<string, unknown> };
export type SpanUpsertHandler = (span: SpanEventPayload) => void;

// Type guards and normalizers for realtime payloads
function toSpanDoc(payload: unknown): SpanDoc | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const traceId = typeof p.traceId === 'string' ? p.traceId : undefined;
  const spanId = typeof p.spanId === 'string' ? p.spanId : undefined;
  if (!traceId || !spanId) return null;
  const name = typeof p.name === 'string'
    ? p.name
    // allow fallback to "label" for legacy payloads
    : (typeof p.label === 'string' ? (p.label as string) : 'span');
  const startedAt = typeof p.startedAt === 'string'
    ? p.startedAt
    // allow fallback field for legacy payloads
    : (typeof p.startTime === 'string' ? (p.startTime as string) : new Date().toISOString());
  const attributes = p.attributes && typeof p.attributes === 'object'
    ? (p.attributes as Record<string, unknown>)
    : undefined;
  return { traceId, spanId, name, startedAt, ...(attributes ? { attributes } : {}) };
}

function toSpanExtras(payload: unknown): Partial<SpanExtras> {
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as Record<string, unknown>;
  const status = typeof p.status === 'string' ? p.status : undefined;
  const lastUpdate = typeof p.lastUpdate === 'string' ? p.lastUpdate : undefined;
  const nodeId = typeof p.nodeId === 'string' ? p.nodeId : undefined;
  // prefer top-level endedAt when valid string
  const endedAt = typeof p.endedAt === 'string' ? p.endedAt : undefined;
  return { status, lastUpdate, nodeId, endedAt };
}

function normalizeSpan(payload: unknown): SpanEventPayload | null {
  const base = toSpanDoc(payload);
  if (!base) return null;
  const extras = toSpanExtras(payload);
  const attributes = base.attributes; // already normalized
  return { ...base, ...extras, ...(attributes ? { attributes } : {}) };
}

class TracingRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();

  private ensure() {
    if (this.socket) return;
    if (!TRACING_BASE) return; // allow usage without socket (tests/SSR)
    const url = TRACING_BASE.endsWith('/') ? TRACING_BASE.slice(0, -1) : TRACING_BASE;
    this.socket = io(url, { path: '/socket.io', transports: ['websocket'], timeout: 10000, autoConnect: true });
    this.socket.on('span_upsert', (payload: unknown) => {
      const norm = normalizeSpan(payload);
      if (norm) this.handlers.forEach((h) => h(norm));
    });
  }

  onSpanUpsert(handler: SpanUpsertHandler) {
    // Register handler first; connect only when server URL configured
    this.ensure();
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Test-only API: emit a span_upsert to subscribers without a socket.
  // This is safe and public for tests; do not use in production code.
  emitSpanUpsertForTest(span: SpanEventPayload) {
    const norm = normalizeSpan(span) || span;
    this.handlers.forEach((h) => h(norm));
  }
}

export const tracingRealtime = new TracingRealtime();
