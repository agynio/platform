import { io, type Socket } from 'socket.io-client';
import type { NodeStatusEvent, ReminderCountEvent } from './types';

// Strictly typed server-to-client socket events
type NodeStateEvent = { nodeId: string; state: Record<string, unknown>; updatedAt: string };
type ServerToClientEvents = {
  connect: void;
  node_status: NodeStatusEvent;
  node_state: NodeStateEvent;
  node_reminder_count: ReminderCountEvent;
};
// No client-to-server emits used here
type ClientToServerEvents = Record<string, never>;

type Listener = (ev: NodeStatusEvent) => void;
type StateListener = (ev: NodeStateEvent) => void;
type ReminderListener = (ev: ReminderCountEvent) => void;

class GraphSocket {
  // Typed socket instance; null until connected
  private socket: Socket<ClientToServerEvents, ServerToClientEvents> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private stateListeners = new Map<string, Set<StateListener>>();
  private reminderListeners = new Map<string, Set<ReminderListener>>();

  connect() {
    if (this.socket) return this.socket;
    // Derive host lazily from env to avoid import-time errors in tests
    const host = (import.meta as { env?: Record<string, unknown> } | undefined)?.env?.VITE_API_BASE_URL as string | undefined;
    if (!host || host.trim() === '') {
      // No API base configured; provide no-op behavior.
      return null;
    }
    this.socket = io(host, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: false,
      autoConnect: true,
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
    this.socket.on('node_reminder_count', (payload: ReminderCountEvent) => {
      const set = this.reminderListeners.get(payload.nodeId);
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

  onReminderCount(nodeId: string, cb: ReminderListener) {
    let set = this.reminderListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.reminderListeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.reminderListeners.delete(nodeId);
    };
  }
}

export const graphSocket = new GraphSocket();
