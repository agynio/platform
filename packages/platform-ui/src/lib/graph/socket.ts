// CI trigger: no-op comment to touch UI file
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import { getSocketBaseUrl } from '@/config';
import type { NodeStatusEvent, ReminderCountEvent } from './types';
import type { RunTimelineEvent, RunTimelineEventsCursor, ToolOutputChunk, ToolOutputTerminal } from '@/api/types/agents';

// Strictly typed server-to-client socket events (listener signatures)
type NodeStateEvent = { nodeId: string; state: Record<string, unknown>; updatedAt: string };
type ThreadSummary = { id: string; alias: string; summary: string | null; status: 'open' | 'closed'; createdAt: string; parentId?: string | null };
type MessageSummary = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text: string | null; source: unknown; createdAt: string; runId?: string };
type RunSummary = {
  id: string;
  threadId?: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};
type RunEventSocketPayload = { runId: string; mutation: 'append' | 'update'; event: RunTimelineEvent };
interface ServerToClientEvents {
  node_status: (payload: NodeStatusEvent) => void;
  node_state: (payload: NodeStateEvent) => void;
  node_reminder_count: (payload: ReminderCountEvent) => void;
  thread_created: (payload: { thread: ThreadSummary }) => void;
  thread_updated: (payload: { thread: ThreadSummary }) => void;
  thread_activity_changed: (payload: { threadId: string; activity: 'working' | 'waiting' | 'idle' }) => void;
  thread_reminders_count: (payload: { threadId: string; remindersCount: number }) => void;
  message_created: (payload: { threadId: string; message: MessageSummary }) => void;
  run_status_changed: (payload: RunStatusChangedPayload) => void;
  run_event_appended: (payload: RunEventSocketPayload) => void;
  run_event_updated: (payload: RunEventSocketPayload) => void;
  tool_output_chunk: (payload: ToolOutputChunk) => void;
  tool_output_terminal: (payload: ToolOutputTerminal) => void;
}
// Client-to-server emits: subscribe to rooms
type SubscribePayload = { room?: string; rooms?: string[] };
interface ClientToServerEvents { subscribe: (payload: SubscribePayload) => void }

type Listener = (ev: NodeStatusEvent) => void;
type StateListener = (ev: { nodeId: string; state: Record<string, unknown>; updatedAt: string }) => void;
type ReminderListener = (ev: ReminderCountEvent) => void;
type ThreadCreatedPayload = { thread: ThreadSummary };
type ThreadUpdatedPayload = { thread: ThreadSummary };
type ThreadActivityPayload = { threadId: string; activity: 'working' | 'waiting' | 'idle' };
type ThreadRemindersPayload = { threadId: string; remindersCount: number };
type MessageCreatedPayload = { message: MessageSummary; threadId: string };
type RunStatusChangedPayload = { threadId: string; run: RunSummary };
type RunEventListenerPayload = RunEventSocketPayload;
type ToolChunkListener = (payload: ToolOutputChunk) => void;
type ToolTerminalListener = (payload: ToolOutputTerminal) => void;

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
  private runEventListeners = new Set<(payload: RunEventListenerPayload) => void>();
  private toolChunkListeners = new Set<ToolChunkListener>();
  private toolTerminalListeners = new Set<ToolTerminalListener>();
  private subscribedRooms = new Set<string>();
  private connectCallbacks = new Set<() => void>();
  private reconnectCallbacks = new Set<() => void>();
  private disconnectCallbacks = new Set<() => void>();
  private runCursors = new Map<string, RunTimelineEventsCursor>();
  private socketCleanup: Array<() => void> = [];
  private managerCleanup: Array<() => void> = [];

  private compareCursors(a: RunTimelineEventsCursor, b: RunTimelineEventsCursor): number {
    const parsedA = Date.parse(a.ts);
    const parsedB = Date.parse(b.ts);
    const timeA = Number.isNaN(parsedA) ? 0 : parsedA;
    const timeB = Number.isNaN(parsedB) ? 0 : parsedB;
    if (timeA !== timeB) return timeA - timeB;
    const lexical = a.ts.localeCompare(b.ts);
    if (lexical !== 0) return lexical;
    return a.id.localeCompare(b.id);
  }

  private bumpRunCursor(runId: string, candidate: RunTimelineEventsCursor | null, opts?: { force?: boolean }) {
    if (!runId) return;
    if (!candidate) {
      this.runCursors.delete(runId);
      return;
    }
    const current = this.runCursors.get(runId);
    if (!current || opts?.force || this.compareCursors(candidate, current) > 0) {
      this.runCursors.set(runId, candidate);
    }
  }

  private emitSubscriptions(rooms: string[]) {
    if (!rooms.length) return;
    const sock = this.socket;
    if (!sock) return;
    sock.emit('subscribe', { rooms });
  }

  private resubscribeAll() {
    if (!this.socket || this.subscribedRooms.size === 0) return;
    this.emitSubscriptions(Array.from(this.subscribedRooms));
  }

  connect(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (this.socket) return this.socket;
    const host = getSocketBaseUrl();
    // Cast to typed Socket to enable event payload typing
    const transports: ManagerOptions['transports'] = ['websocket'];
    const options: Partial<ManagerOptions & SocketOptions> = {
      path: '/socket.io',
      transports,
      forceNew: false,
      autoConnect: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: false,
    };
    this.socketCleanup = [];
    this.managerCleanup = [];

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(host, options);
    this.socket = socket;

    const manager = socket.io;

    const handleConnect = () => {
      this.resubscribeAll();
      for (const fn of this.connectCallbacks) fn();
    };
    const handleReconnect = () => {
      this.resubscribeAll();
      for (const fn of this.reconnectCallbacks) fn();
    };
    const handleDisconnect = () => {
      for (const fn of this.disconnectCallbacks) fn();
    };
    const handleConnectError = () => {};
    socket.on('connect', handleConnect);
    this.socketCleanup.push(() => socket.off('connect', handleConnect));
    socket.on('disconnect', handleDisconnect);
    this.socketCleanup.push(() => socket.off('disconnect', handleDisconnect));
    socket.on('connect_error', handleConnectError);
    this.socketCleanup.push(() => socket.off('connect_error', handleConnectError));
    manager.on('reconnect', handleReconnect);
    this.managerCleanup.push(() => manager.off('reconnect', handleReconnect));
    // No-op connect listener; optional
    const handleNodeStatus: ServerToClientEvents['node_status'] = (payload) => {
      const set = this.listeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    };
    socket.on('node_status', handleNodeStatus);
    this.socketCleanup.push(() => socket.off('node_status', handleNodeStatus));

    const handleNodeState: ServerToClientEvents['node_state'] = (payload) => {
      const set = this.stateListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    };
    socket.on('node_state', handleNodeState);
    this.socketCleanup.push(() => socket.off('node_state', handleNodeState));

    const handleNodeReminderCount: ServerToClientEvents['node_reminder_count'] = (payload) => {
      const set = this.reminderListeners.get(payload.nodeId);
      if (set) for (const fn of set) fn(payload);
    };
    socket.on('node_reminder_count', handleNodeReminderCount);
    this.socketCleanup.push(() => socket.off('node_reminder_count', handleNodeReminderCount));
    // Threads events
    const handleThreadCreated: ServerToClientEvents['thread_created'] = (payload) => {
      for (const fn of this.threadCreatedListeners) fn(payload);
    };
    socket.on('thread_created', handleThreadCreated);
    this.socketCleanup.push(() => socket.off('thread_created', handleThreadCreated));

    const handleThreadUpdated: ServerToClientEvents['thread_updated'] = (payload) => {
      for (const fn of this.threadUpdatedListeners) fn(payload);
    };
    socket.on('thread_updated', handleThreadUpdated);
    this.socketCleanup.push(() => socket.off('thread_updated', handleThreadUpdated));

    const handleThreadActivityChanged: ServerToClientEvents['thread_activity_changed'] = (payload) => {
      for (const fn of this.threadActivityListeners) fn(payload);
    };
    socket.on('thread_activity_changed', handleThreadActivityChanged);
    this.socketCleanup.push(() => socket.off('thread_activity_changed', handleThreadActivityChanged));

    const handleThreadRemindersCount: ServerToClientEvents['thread_reminders_count'] = (payload) => {
      for (const fn of this.threadRemindersListeners) fn(payload);
    };
    socket.on('thread_reminders_count', handleThreadRemindersCount);
    this.socketCleanup.push(() => socket.off('thread_reminders_count', handleThreadRemindersCount));

    const handleMessageCreated: ServerToClientEvents['message_created'] = (payload) => {
      for (const fn of this.messageCreatedListeners) fn(payload);
    };
    socket.on('message_created', handleMessageCreated);
    this.socketCleanup.push(() => socket.off('message_created', handleMessageCreated));

    const handleRunStatusChanged: ServerToClientEvents['run_status_changed'] = (payload) => {
      for (const fn of this.runStatusListeners) fn(payload);
    };
    socket.on('run_status_changed', handleRunStatusChanged);
    this.socketCleanup.push(() => socket.off('run_status_changed', handleRunStatusChanged));
    const handleRunEvent = (eventName: 'run_event_appended' | 'run_event_updated', payload: RunEventSocketPayload) => {
      const cursor = { ts: payload.event.ts, id: payload.event.id } as RunTimelineEventsCursor;
      const force = eventName === 'run_event_updated';
      this.bumpRunCursor(payload.runId, cursor, force ? { force: true } : undefined);
      for (const fn of this.runEventListeners) fn(payload);
    };
    const handleRunEventAppended: ServerToClientEvents['run_event_appended'] = (payload) =>
      handleRunEvent('run_event_appended', payload);
    socket.on('run_event_appended', handleRunEventAppended);
    this.socketCleanup.push(() => socket.off('run_event_appended', handleRunEventAppended));

    const handleRunEventUpdated: ServerToClientEvents['run_event_updated'] = (payload) =>
      handleRunEvent('run_event_updated', payload);
    socket.on('run_event_updated', handleRunEventUpdated);
    this.socketCleanup.push(() => socket.off('run_event_updated', handleRunEventUpdated));
    const handleToolOutputChunk: ServerToClientEvents['tool_output_chunk'] = (payload) => {
      for (const fn of this.toolChunkListeners) fn(payload);
    };
    socket.on('tool_output_chunk', handleToolOutputChunk);
    this.socketCleanup.push(() => socket.off('tool_output_chunk', handleToolOutputChunk));

    const handleToolOutputTerminal: ServerToClientEvents['tool_output_terminal'] = (payload) => {
      for (const fn of this.toolTerminalListeners) fn(payload);
    };
    socket.on('tool_output_terminal', handleToolOutputTerminal);
    this.socketCleanup.push(() => socket.off('tool_output_terminal', handleToolOutputTerminal));

    return socket;
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
    const toJoin: string[] = [];
    for (const room of rooms) {
      if (!room || this.subscribedRooms.has(room)) continue;
      this.subscribedRooms.add(room);
      toJoin.push(room);
    }
    this.emitSubscriptions(toJoin);
  }

  unsubscribe(rooms: string[]) {
    for (const room of rooms) {
      this.subscribedRooms.delete(room);
      if (room.startsWith('run:')) {
        const runId = room.slice(4);
        this.runCursors.delete(runId);
      }
    }
  }

  dispose() {
    const socket = this.socket;
    if (socket) {
      for (const cleanup of this.socketCleanup) {
        cleanup();
      }
      for (const cleanup of this.managerCleanup) {
        cleanup();
      }
      this.socketCleanup = [];
      this.managerCleanup = [];
      socket.disconnect();
    }

    this.socket = null;
    this.subscribedRooms.clear();
    this.runCursors.clear();
    this.listeners.clear();
    this.stateListeners.clear();
    this.reminderListeners.clear();
    this.threadCreatedListeners.clear();
    this.threadUpdatedListeners.clear();
    this.threadActivityListeners.clear();
    this.threadRemindersListeners.clear();
    this.messageCreatedListeners.clear();
    this.runStatusListeners.clear();
    this.runEventListeners.clear();
    this.connectCallbacks.clear();
    this.reconnectCallbacks.clear();
    this.disconnectCallbacks.clear();
  }

  // Threads listeners
  onThreadCreated(cb: (payload: ThreadCreatedPayload) => void) {
    this.threadCreatedListeners.add(cb);
    return () => {
      this.threadCreatedListeners.delete(cb);
    };
  }
  onThreadUpdated(cb: (payload: ThreadUpdatedPayload) => void) {
    this.threadUpdatedListeners.add(cb);
    return () => {
      this.threadUpdatedListeners.delete(cb);
    };
  }
  onThreadActivityChanged(cb: (payload: ThreadActivityPayload) => void) {
    this.threadActivityListeners.add(cb);
    return () => {
      this.threadActivityListeners.delete(cb);
    };
  }
  onThreadRemindersCount(cb: (payload: ThreadRemindersPayload) => void) {
    this.threadRemindersListeners.add(cb);
    return () => {
      this.threadRemindersListeners.delete(cb);
    };
  }
  onMessageCreated(cb: (payload: MessageCreatedPayload) => void) {
    this.messageCreatedListeners.add(cb);
    return () => {
      this.messageCreatedListeners.delete(cb);
    };
  }
  onRunEvent(cb: (payload: RunEventListenerPayload) => void) {
    this.runEventListeners.add(cb);
    return () => {
      this.runEventListeners.delete(cb);
    };
  }
  onRunStatusChanged(cb: (payload: RunStatusChangedPayload) => void) {
    this.runStatusListeners.add(cb);
    return () => {
      this.runStatusListeners.delete(cb);
    };
  }

  onToolOutputChunk(cb: ToolChunkListener) {
    this.toolChunkListeners.add(cb);
    return () => {
      this.toolChunkListeners.delete(cb);
    };
  }

  onToolOutputTerminal(cb: ToolTerminalListener) {
    this.toolTerminalListeners.add(cb);
    return () => {
      this.toolTerminalListeners.delete(cb);
    };
  }

  onConnected(cb: () => void) {
    this.connectCallbacks.add(cb);
    return () => {
      this.connectCallbacks.delete(cb);
    };
  }

  onReconnected(cb: () => void) {
    this.reconnectCallbacks.add(cb);
    return () => {
      this.reconnectCallbacks.delete(cb);
    };
  }

  onDisconnected(cb: () => void) {
    this.disconnectCallbacks.add(cb);
    return () => {
      this.disconnectCallbacks.delete(cb);
    };
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }

  setRunCursor(runId: string, cursor: RunTimelineEventsCursor | null, opts?: { force?: boolean }) {
    if (!runId) return;
    this.bumpRunCursor(runId, cursor, opts);
  }

  getRunCursor(runId: string): RunTimelineEventsCursor | null {
    return this.runCursors.get(runId) ?? null;
  }
}

export const graphSocket = new GraphSocket();
