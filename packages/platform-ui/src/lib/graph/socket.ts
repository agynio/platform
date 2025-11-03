import { io, Socket } from 'socket.io-client';
<<<<<<< HEAD
import { getApiBase } from '../apiClient';
import type { NodeStatusEvent, ReminderCountEvent } from './types';
=======
import { getApiBase } from '@/api/client';
import type { NodeStatusEvent } from './types';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)

type NodeStateEvent = { nodeId: string; state: Record<string, unknown>; updatedAt: string };

type Listener = (ev: NodeStatusEvent) => void;
type StateListener = (ev: NodeStateEvent) => void;
<<<<<<< HEAD
type ReminderListener = (ev: ReminderCountEvent) => void;
=======
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)

class GraphSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private stateListeners = new Map<string, Set<StateListener>>();
<<<<<<< HEAD
  private reminderListeners = new Map<string, Set<ReminderListener>>();
=======
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)

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
    this.socket.on('node_state', (payload: NodeStateEvent) => {
      const set = this.stateListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
<<<<<<< HEAD
    this.socket.on('node_reminder_count', (payload: ReminderCountEvent) => {
      const set = this.reminderListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    });
=======
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
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
<<<<<<< HEAD

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
=======
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
}

export const graphSocket = new GraphSocket();
