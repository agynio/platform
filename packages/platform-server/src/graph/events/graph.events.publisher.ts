import type { ThreadStatus, MessageKind, RunStatus } from '@prisma/client';

export type RunEventBroadcast = {
  runId: string;
  mutation: 'append' | 'update';
  event: unknown;
};

export interface GraphEventsPublisherAware {
  setEventsPublisher(publisher: GraphEventsPublisher): void;
}

// Abstract class token to decouple persistence from specific gateway implementations
export abstract class GraphEventsPublisher {
  abstract emitNodeState(nodeId: string, state: Record<string, unknown>, updatedAtMs?: number): void;
  abstract emitThreadCreated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  abstract emitThreadUpdated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  abstract emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void;
  abstract emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void;
  abstract emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast): void;
  abstract emitToolOutputChunk(payload: {
    runId: string;
    threadId: string;
    eventId: string;
    seqGlobal: number;
    seqStream: number;
    source: 'stdout' | 'stderr';
    ts: Date;
    data: string;
  }): void;
  abstract emitToolOutputTerminal(payload: {
    runId: string;
    threadId: string;
    eventId: string;
    exitCode: number | null;
    status: 'success' | 'error' | 'timeout' | 'idle_timeout' | 'cancelled' | 'truncated';
    bytesStdout: number;
    bytesStderr: number;
    totalChunks: number;
    droppedChunks: number;
    savedPath?: string | null;
    message?: string | null;
    ts: Date;
  }): void;
  abstract scheduleThreadMetrics(threadId: string): void;
  abstract scheduleThreadAndAncestorsMetrics(threadId: string): Promise<void> | void;
  abstract emitReminderCount(nodeId: string, count: number, updatedAtMs?: number): void;
}

// No-op publisher for tests or environments without sockets
export class NoopGraphEventsPublisher extends GraphEventsPublisher {
  emitNodeState(_nodeId: string, _state: Record<string, unknown>, _updatedAtMs?: number): void {}
  emitThreadCreated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitThreadUpdated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitMessageCreated(_threadId: string, _message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void {}
  emitRunStatusChanged(_threadId: string, _run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void {}
  emitRunEvent(_runId: string, _threadId: string, _payload: RunEventBroadcast): void {}
  emitToolOutputChunk(_payload: {
    runId: string;
    threadId: string;
    eventId: string;
    seqGlobal: number;
    seqStream: number;
    source: 'stdout' | 'stderr';
    ts: Date;
    data: string;
  }): void {}
  emitToolOutputTerminal(_payload: {
    runId: string;
    threadId: string;
    eventId: string;
    exitCode: number | null;
    status: 'success' | 'error' | 'timeout' | 'idle_timeout' | 'cancelled' | 'truncated';
    bytesStdout: number;
    bytesStderr: number;
    totalChunks: number;
    droppedChunks: number;
    savedPath?: string | null;
    message?: string | null;
    ts: Date;
  }): void {}
  scheduleThreadMetrics(_threadId: string): void {}
  async scheduleThreadAndAncestorsMetrics(_threadId: string): Promise<void> {}
  emitReminderCount(_nodeId: string, _count: number, _updatedAtMs?: number): void {}
}
