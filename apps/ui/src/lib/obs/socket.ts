// Minimal obs realtime socket client (span_upsert events)
import { io, Socket } from 'socket.io-client';
import type { SpanDoc } from './api';

const OBS_BASE: string = import.meta.env.VITE_OBS_SERVER_URL || 'http://localhost:4319';

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

class ObsRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();

  private ensure() {
    if (this.socket) return;
    this.socket = io(OBS_BASE, { path: '/socket.io', transports: ['websocket'], timeout: 10000, autoConnect: true });
    this.socket.on('span_upsert', (payload: unknown) => {
      if (isSpanDoc(payload)) {
        this.handlers.forEach((h) => h(payload));
      }
    });
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

export const obsRealtime = new ObsRealtime();
