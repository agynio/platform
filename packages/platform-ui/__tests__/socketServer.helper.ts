import { createServer, type Server as HTTPServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketIOServer } from 'socket.io';
import type { RunTimelineEvent } from '../src/api/types/agents';

type ThreadSummaryPayload = {
  id: string;
  alias: string;
  summary: string | null;
  status: 'open' | 'closed';
  createdAt: string;
  parentId?: string | null;
};

type ThreadActivityPayload = {
  threadId: string;
  activity: 'working' | 'waiting' | 'idle';
};

type ThreadRemindersPayload = {
  threadId: string;
  remindersCount: number;
};

type MessagePayload = {
  id: string;
  kind: 'assistant' | 'user' | 'system' | 'tool';
  text: string | null;
  source: unknown;
  createdAt: string;
  runId?: string;
};

type RunStatusPayload = {
  id: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};

type NodeStatusPayload = {
  nodeId: string;
  provisionStatus?: {
    state: 'not_ready' | 'provisioning' | 'ready' | 'deprovisioning' | 'provisioning_error' | 'deprovisioning_error';
    details?: unknown;
  };
  updatedAt?: string;
};

type NodeStatePayload = {
  nodeId: string;
  state: Record<string, unknown>;
  updatedAt: string;
};

type ReminderCountPayload = {
  nodeId: string;
  count: number;
  updatedAt: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAllowedRoom(room: string): boolean {
  if (room === 'threads' || room === 'graph') return true;
  if (room.startsWith('thread:') || room.startsWith('run:') || room.startsWith('node:')) {
    const [, id] = room.split(':');
    return typeof id === 'string' && uuidPattern.test(id);
  }
  return false;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type TestSocketServer = {
  port: number;
  baseUrl: string;
  close(): Promise<void>;
  waitForRoom(room: string, timeoutMs?: number): Promise<void>;
  waitForRooms(rooms: string[], timeoutMs?: number): Promise<void>;
  emitThreadCreated(thread: ThreadSummaryPayload): void;
  emitThreadUpdated(thread: ThreadSummaryPayload): void;
  emitThreadActivity(payload: ThreadActivityPayload): void;
  emitThreadReminders(payload: ThreadRemindersPayload): void;
  emitMessageCreated(threadId: string, message: MessagePayload): void;
  emitRunStatusChanged(threadId: string, run: RunStatusPayload): void;
  emitRunEvent(runId: string, threadId: string, payload: { runId: string; mutation: 'append' | 'update'; event: RunTimelineEvent }): void;
  emitNodeStatus(payload: NodeStatusPayload): void;
  emitNodeState(payload: NodeStatePayload): void;
  emitReminderCount(payload: ReminderCountPayload): void;
};

function hasSubscribers(io: SocketIOServer, room: string): boolean {
  const adapter = io.of('/').adapter;
  const set = adapter.rooms.get(room);
  return typeof set?.size === 'number' && set.size > 0;
}

export async function createSocketTestServer(): Promise<TestSocketServer> {
  const httpServer: HTTPServer = createServer();
  const io = new SocketIOServer(httpServer, { path: '/socket.io', transports: ['websocket'] });

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const candidateRooms: string[] = [];
      const roomsField = (payload as { rooms?: unknown }).rooms;
      const roomField = (payload as { room?: unknown }).room;
      if (Array.isArray(roomsField)) {
        for (const r of roomsField) if (typeof r === 'string') candidateRooms.push(r);
      }
      if (typeof roomField === 'string') candidateRooms.push(roomField);
      for (const room of candidateRooms) {
        if (!isAllowedRoom(room)) continue;
        socket.join(room).catch(() => {});
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const waitForRoom = async (room: string, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (hasSubscribers(io, room)) return;
      await wait(20);
    }
    throw new Error(`Timed out waiting for subscribers to room ${room}`);
  };

  const waitForRooms = async (rooms: string[], timeoutMs = 2000) => {
    for (const room of rooms) {
      await waitForRoom(room, timeoutMs);
    }
  };

  const emitThreadCreated = (thread: ThreadSummaryPayload) => {
    io.to('threads').emit('thread_created', { thread });
  };

  const emitThreadUpdated = (thread: ThreadSummaryPayload) => {
    io.to('threads').emit('thread_updated', { thread });
  };

  const emitThreadActivity = (payload: ThreadActivityPayload) => {
    io.to('threads').emit('thread_activity_changed', payload);
    io.to(`thread:${payload.threadId}`).emit('thread_activity_changed', payload);
  };

  const emitThreadReminders = (payload: ThreadRemindersPayload) => {
    io.to('threads').emit('thread_reminders_count', payload);
    io.to(`thread:${payload.threadId}`).emit('thread_reminders_count', payload);
  };

  const emitMessageCreated = (threadId: string, message: MessagePayload) => {
    io.to(`thread:${threadId}`).emit('message_created', { message });
  };

  const emitRunStatusChanged = (threadId: string, run: RunStatusPayload) => {
    io.to(`thread:${threadId}`).emit('run_status_changed', { run });
    io.to(`run:${run.id}`).emit('run_status_changed', { run });
  };

  const emitRunEvent = (runId: string, threadId: string, payload: { runId: string; mutation: 'append' | 'update'; event: RunTimelineEvent }) => {
    io.to(`run:${runId}`).emit('run_event_appended', payload);
    io.to(`thread:${threadId}`).emit('run_event_appended', payload);
  };

  const emitNodeStatus = (payload: NodeStatusPayload) => {
    io.to('graph').emit('node_status', payload);
    io.to(`node:${payload.nodeId}`).emit('node_status', payload);
  };

  const emitNodeState = (payload: NodeStatePayload) => {
    io.to('graph').emit('node_state', payload);
    io.to(`node:${payload.nodeId}`).emit('node_state', payload);
  };

  const emitReminderCount = (payload: ReminderCountPayload) => {
    io.to('graph').emit('node_reminder_count', payload);
    io.to(`node:${payload.nodeId}`).emit('node_reminder_count', payload);
  };

  const close = async () => {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    port,
    baseUrl,
    close,
    waitForRoom,
    waitForRooms,
    emitThreadCreated,
    emitThreadUpdated,
    emitThreadActivity,
    emitThreadReminders,
    emitMessageCreated,
    emitRunStatusChanged,
    emitRunEvent,
    emitNodeStatus,
    emitNodeState,
    emitReminderCount,
  };
}
