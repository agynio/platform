import type { ThreadStatus, MessageKind, RunStatus } from '@prisma/client';

export type RunEventBroadcast = {
  runId: string;
  mutation: 'append' | 'update';
  event: unknown;
};

// Abstract class token to decouple persistence from socket gateway
export abstract class GraphEventsPublisher {
  abstract emitThreadCreated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  abstract emitThreadUpdated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  abstract emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void;
  abstract emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void;
  abstract emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast): void;
  abstract scheduleThreadMetrics(threadId: string): void;
  abstract scheduleThreadAndAncestorsMetrics(threadId: string): Promise<void> | void;
}

// No-op publisher for tests or environments without sockets
export class NoopGraphEventsPublisher extends GraphEventsPublisher {
  emitThreadCreated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitThreadUpdated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitMessageCreated(_threadId: string, _message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void {}
  emitRunStatusChanged(_threadId: string, _run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void {}
  emitRunEvent(_runId: string, _threadId: string, _payload: RunEventBroadcast): void {}
  scheduleThreadMetrics(_threadId: string): void {}
  async scheduleThreadAndAncestorsMetrics(_threadId: string): Promise<void> {}
}
