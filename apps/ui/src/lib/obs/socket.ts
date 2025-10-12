// Minimal obs realtime socket client (span_upsert events)
import { io, Socket } from 'socket.io-client';
import type { SpanDoc } from './api';

const OBS_BASE: string = import.meta.env.VITE_OBS_SERVER_URL || 'http://localhost:4319';

export type SpanUpsertHandler = (span: SpanDoc) => void;

class ObsRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();

  private ensure() {
    if (this.socket) return;
    this.socket = io(OBS_BASE, { path: '/socket.io', transports: ['websocket'], timeout: 10000, autoConnect: true });
    this.socket.on('span_upsert', (payload: any) => {
      if (payload && typeof payload === 'object' && payload.traceId && payload.spanId) {
        this.handlers.forEach(h => h(payload as SpanDoc));
      }
    });
  }

  onSpanUpsert(handler: SpanUpsertHandler) {
    this.ensure();
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export const obsRealtime = new ObsRealtime();
