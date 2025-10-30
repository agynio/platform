import { io, Socket } from 'socket.io-client';
import { getApiBase } from '../apiClient';
import type { NodeStatusEvent } from './types';

type NodeStateEvent = { nodeId: string; state: Record<string, unknown>; updatedAt: string };

type Listener = (ev: NodeStatusEvent) => void;
type StateListener = (ev: NodeStateEvent) => void;

class GraphSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private stateListeners = new Map<string, Set<StateListener>>();

  // Construct socket and register listeners without connecting
  init(baseUrl?: string) {
    if (this.socket) return this.socket;
    const host = getApiBase(baseUrl);
    this.socket = io(host, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: false,
      autoConnect: false,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: true,
    });
    this.socket.on('connect', () => {
      // noop
    });
    this.socket.on('node_status', (payload: NodeStatusEvent) => {
      const set = this.listeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
    this.socket.on('node_state', (payload: NodeStateEvent) => {
      const set = this.stateListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
    return this.socket;
  }

  // Start the connection if initialized
  start() {
    if (!this.socket) return;
    if (!this.socket.connected) this.socket.connect();
  }

  isInitialized(): boolean {
    return this.socket !== null;
  }

  isConnected(): boolean {
    const s = this.socket;
    return !!(s && s.connected);
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

  onNodeState(nodeId: string, cb: StateListener) {
    let set = this.stateListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.stateListeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.stateListeners.delete(nodeId);
    };
  }
}

export const graphSocket = new GraphSocket();
