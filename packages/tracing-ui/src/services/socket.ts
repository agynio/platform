import { io, Socket } from 'socket.io-client';
import { SpanDoc, LogDoc } from '../types';
import { isBrowser, isTest } from '../utils/env';

// Lightweight singleton socket for span realtime events.
// Stage 1: global subscription to all span_upsert events.
export type SpanUpsertHandler = (span: SpanDoc) => void;
export type LogHandler = (log: LogDoc) => void;

class SpanRealtime {
  private socket: Socket | null = null;
  private handlers = new Set<SpanUpsertHandler>();
  private logHandlers = new Set<LogHandler>();
  private connecting = false;
  private connected = false;
  private lastPongTs: number | null = null;
  private pingInterval: any;
  private listeners: Array<(state: { connected: boolean; lastPongTs: number | null }) => void> = [];

  // Use centralized env helpers

  private notify() {
    const state = { connected: this.connected, lastPongTs: this.lastPongTs };
    this.listeners.forEach(l => l(state));
  }

  private startPing() {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (!this.socket || !this.connected) return;
      try {
        this.socket.timeout(4000).emit('ping', { ts: Date.now() }, (resp: any) => {
          if (resp && typeof resp.ts === 'number') {
            this.lastPongTs = resp.ts;
            if (this.lastPongTs)
              console.debug('[obs-realtime] pong (ack) at', new Date(this.lastPongTs).toISOString());
            this.notify();
          }
        });
      } catch (e) {
        console.warn('[obs-realtime] ping error', e);
      }
    }, 10000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private ensure() {
    // Skip realtime in tests and non-browser/SSR to prevent window access and stray timers
    if (isTest || !isBrowser) return;
    if (this.socket || this.connecting) return;
    this.connecting = true;
    const url = 'http://localhost:4319'; // Hardcoded dev endpoint
    console.info('[obs-realtime] connecting to', url);
    const s = io(url, { path: '/socket.io', transports: ['websocket'], timeout: 10000 });
    this.socket = s;
    s.on('connect', () => {
      this.connecting = false;
      this.connected = true;
      console.info('[obs-realtime] connected socket id', s.id);
      this.startPing();
      this.notify();
    });
    s.on('disconnect', (reason) => {
      this.connected = false;
      console.warn('[obs-realtime] disconnected', reason);
      this.stopPing();
      this.notify();
    });
    s.on('connect_error', (err) => {
      console.error('[obs-realtime] connect_error', err.message);
    });
    s.on('connected', (payload: any) => {
      console.debug('[obs-realtime] server connected event', payload);
    });
    s.on('pong', (payload: any) => {
      if (payload && typeof payload.ts === 'number') {
        this.lastPongTs = payload.ts;
        if (this.lastPongTs)
          console.debug('[obs-realtime] pong event at', new Date(this.lastPongTs).toISOString());
        this.notify();
      }
    });
    s.on('span_upsert', (payload: any) => {
      if (payload && typeof payload === 'object' && payload.traceId && payload.spanId) {
        this.handlers.forEach(h => h(payload as SpanDoc));
      }
    });
    s.on('log', (payload: any) => {
      if (payload && typeof payload === 'object' && payload.message) {
        this.logHandlers.forEach(h => h(payload as LogDoc));
      }
    });
  }

  onSpanUpsert(handler: SpanUpsertHandler) {
    this.ensure();
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
      this.maybeShutdown();
    };
  }

  onLog(handler: LogHandler) {
    this.ensure();
    this.logHandlers.add(handler);
    return () => {
      this.logHandlers.delete(handler);
      this.maybeShutdown();
    };
  }

  onConnectionState(listener: (state: { connected: boolean; lastPongTs: number | null }) => void) {
    this.ensure();
    this.listeners.push(listener);
    listener({ connected: this.connected, lastPongTs: this.lastPongTs });
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
      this.maybeShutdown();
    };
  }

  // Disconnect and stop timers when there are no subscribers left
  private maybeShutdown() {
    if (this.handlers.size === 0 && this.logHandlers.size === 0 && this.listeners.length === 0) {
      try {
        this.stopPing();
        if (this.socket) {
          this.socket.disconnect();
        }
      } catch {}
      this.socket = null;
      this.connected = false;
      this.connecting = false;
    }
  }
}

export const spanRealtime = new SpanRealtime();
