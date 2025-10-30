// Minimal tracing realtime socket client (span_upsert events)
import { io, Socket } from 'socket.io-client';
import type { SpanDoc } from '../tracing/api';

const TRACING_BASE: string = import.meta.env.VITE_TRACING_SERVER_URL || 'http://localhost:4319';

export type SpanUpsertHandler = (span: SpanDoc) => void;

// Narrow unknown payloads coming from the socket into SpanDoc
function isSpanDoc(payload: unknown): payload is SpanDoc {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  // Minimal field checks; tolerate extra fields
  if (typeof p.traceId !== 'string') return false;
  if (typeof p.spanId !== 'string') return false;
  if (typeof p.label !== 'string') return false;
  if (p.status !== 'running' && p.status !== 'ok' && p.status !== 'error' && p.status !== 'cancelled') return false;
  if (typeof p.startTime !== 'string') return false;
  if (typeof p.completed !== 'boolean') return false;
  if (typeof p.lastUpdate !== 'string') return false;
  // attributes is an object (may be empty)
  if (typeof p.attributes !== 'object' || p.attributes === null) return false;
  return true;
}

class TracingRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();

  // Detect Vitest/JSDOM test environment to avoid connecting sockets in tests
  private isVitestEnv(): boolean {
    try {
      const p: unknown = typeof process !== "undefined" ? process : undefined;
      const env: unknown = p && typeof p === "object" && "env" in (p as Record<string, unknown>)
        ? (p as { env?: unknown }).env
        : undefined;
      if (env && typeof env === "object" && "VITEST" in (env as Record<string, unknown>)) return true;
      const im: unknown = (typeof import.meta !== "undefined" ? import.meta : undefined) ?? (globalThis as { importMeta?: unknown }).importMeta;
      const has = (obj: unknown, key: string): obj is Record<string, unknown> => !!obj && typeof obj === "object" && key in obj;
      if (has(im, "vitest")) return true;
      const g = globalThis as Record<string, unknown>;
      if (typeof g.vitest !== "undefined") return true;
      if (typeof g.vi !== "undefined") return true;
      return false;
    } catch {
      return false;
    }
  }

  private ensure() {
    if (this.socket) return;
    this.socket = io(TRACING_BASE, { path: '/socket.io', transports: ['websocket'], timeout: 10000, autoConnect: false });
    this.socket.on('span_upsert', (payload: unknown) => {
      if (isSpanDoc(payload)) {
        this.handlers.forEach((h) => h(payload));
      }
    });
    // Connect after listeners are registered; skip under Vitest to avoid MSW warnings
    if (!this.isVitestEnv()) {
      const s = this.socket;
      if (s && !s.connected) s.connect();
    }
  }

  onSpanUpsert(handler: SpanUpsertHandler) {
    this.ensure();
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Test-only API: emit a span_upsert to subscribers without a socket.
  // This is safe and public for tests; do not use in production code.
  emitSpanUpsertForTest(span: SpanDoc) {
    this.handlers.forEach((h) => h(span));
  }
}

export const obsRealtime = new TracingRealtime();
