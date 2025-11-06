// CI trigger: no-op comment to touch UI file
import { io, type Socket } from 'socket.io-client';
import type { NodeStatusEvent, ReminderCountEvent } from './types';

// Strictly typed server-to-client socket events (listener signatures)
type NodeStateEvent = { nodeId: string; state: Record<string, unknown>; updatedAt: string };
type ThreadSummary = { id: string; alias: string; summary: string | null; status: 'open' | 'closed'; createdAt: string; parentId?: string | null };
type MessageSummary = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text: string | null; source: unknown; createdAt: string; runId?: string };
type RunSummary = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };
interface ServerToClientEvents {
  node_status: (payload: NodeStatusEvent) => void;
  node_state: (payload: NodeStateEvent) => void;
  node_reminder_count: (payload: ReminderCountEvent) => void;
  thread_created: (payload: { thread: ThreadSummary }) => void;
  thread_updated: (payload: { thread: ThreadSummary }) => void;
  thread_activity_changed: (payload: { threadId: string; activity: 'working' | 'waiting' | 'idle' }) => void;
  thread_reminders_count: (payload: { threadId: string; remindersCount: number }) => void;
  message_created: (payload: { message: MessageSummary }) => void;
  run_status_changed: (payload: { run: RunSummary }) => void;
}
// Client-to-server emits: subscribe to rooms
type SubscribePayload = { room?: string; rooms?: string[] };
interface ClientToServerEvents { subscribe: (payload: SubscribePayload) => void }

type Listener = (ev: NodeStatusEvent) => void;
type StateListener = (ev: NodeStateEvent) => void;
type ReminderListener = (ev: ReminderCountEvent) => void;
type ThreadCreatedPayload = { thread: ThreadSummary };
type ThreadUpdatedPayload = { thread: ThreadSummary };
type ThreadActivityPayload = { threadId: string; activity: 'working' | 'waiting' | 'idle' };
type ThreadRemindersPayload = { threadId: string; remindersCount: number };
type MessageCreatedPayload = { message: MessageSummary };
type RunStatusChangedPayload = { run: RunSummary };

class GraphSocket {
  // Typed socket instance; null until connected
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private stateListeners = new Map<string, Set<StateListener>>();
  private reminderListeners = new Map<string, Set<ReminderListener>>();
  private threadCreatedListeners = new Set<(payload: ThreadCreatedPayload) => void>();
  private threadUpdatedListeners = new Set<(payload: ThreadUpdatedPayload) => void>();
  private threadActivityListeners = new Set<(payload: ThreadActivityPayload) => void>();
  private threadRemindersListeners = new Set<(payload: ThreadRemindersPayload) => void>();
  private messageCreatedListeners = new Set<(payload: MessageCreatedPayload) => void>();
  private runStatusListeners = new Set<(payload: RunStatusChangedPayload) => void>();

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
    // No-op connect listener; optional
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
    // Threads events
    this.socket.on('thread_created', (payload: ThreadCreatedPayload) => { for (const fn of this.threadCreatedListeners) fn(payload); });
    this.socket.on('thread_updated', (payload: ThreadUpdatedPayload) => { for (const fn of this.threadUpdatedListeners) fn(payload); });
    this.socket.on('thread_activity_changed', (payload: ThreadActivityPayload) => { for (const fn of this.threadActivityListeners) fn(payload); });
    this.socket.on('thread_reminders_count', (payload: ThreadRemindersPayload) => { for (const fn of this.threadRemindersListeners) fn(payload); });
    this.socket.on('message_created', (payload: MessageCreatedPayload) => { for (const fn of this.messageCreatedListeners) fn(payload); });
    this.socket.on('run_status_changed', (payload: RunStatusChangedPayload) => { for (const fn of this.runStatusListeners) fn(payload); });
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

  // Subscribe to rooms
  subscribe(rooms: string[]) {
    const sock = this.connect();
    if (!sock) return;
    sock.emit('subscribe', { rooms });
  }

  // Threads listeners
  onThreadCreated(cb: (payload: ThreadCreatedPayload) => void) { this.threadCreatedListeners.add(cb); return () => this.threadCreatedListeners.delete(cb); }
  onThreadUpdated(cb: (payload: ThreadUpdatedPayload) => void) { this.threadUpdatedListeners.add(cb); return () => this.threadUpdatedListeners.delete(cb); }
  onThreadActivityChanged(cb: (payload: ThreadActivityPayload) => void) { this.threadActivityListeners.add(cb); return () => this.threadActivityListeners.delete(cb); }
  onThreadRemindersCount(cb: (payload: ThreadRemindersPayload) => void) { this.threadRemindersListeners.add(cb); return () => this.threadRemindersListeners.delete(cb); }
  onMessageCreated(cb: (payload: MessageCreatedPayload) => void) { this.messageCreatedListeners.add(cb); return () => this.messageCreatedListeners.delete(cb); }
  onRunStatusChanged(cb: (payload: RunStatusChangedPayload) => void) { this.runStatusListeners.add(cb); return () => this.runStatusListeners.delete(cb); }
}

export const graphSocket = new GraphSocket();
