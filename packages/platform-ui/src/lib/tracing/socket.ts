// Tracing realtime socket client for platform-ui (span_upsert events)
import { io, type Socket } from 'socket.io-client';
import type { SpanDoc } from '@/api/tracing';
import { config } from '@/config';

const TRACING_BASE: string | undefined = config.tracing.serverUrl;

export type SpanUpsertHandler = (span: SpanDoc & Record<string, unknown>) => void;

// Normalize unknown payloads into the minimal SpanDoc shape while preserving extras
function normalizeSpan(payload: unknown): (SpanDoc & Record<string, unknown>) | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const traceId = typeof p.traceId === 'string' ? p.traceId : undefined;
  const spanId = typeof p.spanId === 'string' ? p.spanId : undefined;
  if (!traceId || !spanId) return null;
  const name = typeof p.name === 'string' ? p.name : (typeof p.label === 'string' ? (p.label as string) : 'span');
  const startedAt = typeof p.startedAt === 'string' ? p.startedAt : (typeof p.startTime === 'string' ? (p.startTime as string) : new Date().toISOString());
  const attributes = (p.attributes && typeof p.attributes === 'object') ? (p.attributes as Record<string, unknown>) : {};
  const base: SpanDoc = { traceId, spanId, name, startedAt, attributes };
  // Preserve all extras so consumers can read optional fields with guards
  return { ...(p as any), ...base } as SpanDoc & Record<string, unknown>;
}

class TracingRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();

  private ensure() {
    if (this.socket) return;
    if (!TRACING_BASE) return; // allow usage without socket (tests/SSR)
    this.socket = io(TRACING_BASE, { path: '/socket.io', transports: ['websocket'], timeout: 10000, autoConnect: true });
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
  emitSpanUpsertForTest(span: SpanDoc & Record<string, unknown>) {
    const norm = normalizeSpan(span) || (span as any as SpanDoc & Record<string, unknown>);
    this.handlers.forEach((h) => h(norm));
  }
}

export const tracingRealtime = new TracingRealtime();

