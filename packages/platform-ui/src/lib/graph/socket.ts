import { io, Socket } from 'socket.io-client';
import { getApiBase } from '../apiClient';
import type { NodeStatusEvent } from './types';

type Listener = (ev: NodeStatusEvent) => void;

class GraphSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();

  connect(baseUrl?: string) {
    if (this.socket) return this.socket;
    const host = getApiBase(baseUrl);
    this.socket = io(host, { path: '/socket.io', transports: ['websocket'], forceNew: false, autoConnect: true, timeout: 10000, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000, withCredentials: true });
    this.socket.on('connect', () => {
      // noop
    });
    this.socket.on('node_status', (payload: NodeStatusEvent) => {
      const set = this.listeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
    return this.socket;
  }

  onNodeStatus(nodeId: string, cb: Listener) {
    let set = this.listeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.listeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(nodeId);
    };
  }
}

export const graphSocket = new GraphSocket();
