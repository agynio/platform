import type { ThreadStatus, MessageKind, RunStatus } from '@prisma/client';

// Interface to decouple persistence from socket gateway
export interface GraphEventsPublisher {
  emitThreadCreated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  emitThreadUpdated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void;
  emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void;
  emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void;
  scheduleThreadMetrics(threadId: string): void;
  scheduleThreadAndAncestorsMetrics(threadId: string): Promise<void> | void;
}

// No-op publisher for tests or environments without sockets
export class NoopGraphEventsPublisher implements GraphEventsPublisher {
  emitThreadCreated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitThreadUpdated(_thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }): void {}
  emitMessageCreated(_threadId: string, _message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void {}
  emitRunStatusChanged(_threadId: string, _run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void {}
  scheduleThreadMetrics(_threadId: string): void {}
  async scheduleThreadAndAncestorsMetrics(_threadId: string): Promise<void> {}
}

