import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { MessageKind, RunStatus, ThreadStatus } from '@prisma/client';
import { EventEmitter } from 'node:events';
import { RunEventsService } from './run-events.service';
import type { RunTimelineEvent, ToolOutputChunkPayload, ToolOutputTerminalPayload } from './run-events.service';

export type RunEventMutation = 'append' | 'update';

export type RunEventBusPayload = {
  eventId: string;
  mutation: RunEventMutation;
  event: RunTimelineEvent | null;
};

export type RunEventBroadcast = {
  runId: string;
  mutation: RunEventMutation;
  event: unknown;
};

export type ReminderCountEvent = {
  nodeId: string;
  count: number;
  updatedAtMs?: number;
  threadId?: string;
};

export type NodeStateBusEvent = {
  nodeId: string;
  state: Record<string, unknown>;
  updatedAtMs?: number;
};

export type ThreadBroadcast = {
  id: string;
  alias: string;
  summary: string | null;
  status: ThreadStatus;
  createdAt: Date;
  parentId?: string | null;
  channelNodeId?: string | null;
  assignedAgentNodeId?: string | null;
};

export type MessageBroadcast = {
  id: string;
  kind: MessageKind;
  text: string | null;
  source: unknown;
  createdAt: Date;
  runId?: string;
};

export type ThreadMetricsEvent = {
  threadId: string;
};

export type ThreadMetricsAncestorsEvent = {
  threadId: string;
};

export type RunStatusBroadcast = {
  threadId: string;
  run: {
    id: string;
    status: RunStatus;
    createdAt: Date;
    updatedAt: Date;
  };
};

type EventsBusEvents = {
  run_event: [RunEventBusPayload];
  tool_output_chunk: [ToolOutputChunkPayload];
  tool_output_terminal: [ToolOutputTerminalPayload];
  reminder_count: [ReminderCountEvent];
  node_state: [NodeStateBusEvent];
  thread_created: [ThreadBroadcast];
  thread_updated: [ThreadBroadcast];
  message_created: [{ threadId: string; message: MessageBroadcast }];
  run_status_changed: [RunStatusBroadcast];
  thread_metrics: [ThreadMetricsEvent];
  thread_metrics_ancestors: [ThreadMetricsAncestorsEvent];
};

@Injectable()
export class EventsBusService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter<EventsBusEvents>();

  constructor(@Inject(RunEventsService) private readonly runEvents: RunEventsService) {
    this.emitter.setMaxListeners(0);
  }

  async publishEvent(eventId: string, mutation: RunEventMutation = 'append'): Promise<RunTimelineEvent | null> {
    const event = await this.runEvents.publishEvent(eventId, mutation);
    this.emitter.emit('run_event', {
      eventId,
      mutation,
      event,
    });
    return event;
  }

  subscribeToRunEvents(listener: (payload: RunEventBusPayload) => void): () => void {
    this.emitter.on('run_event', listener);
    return () => {
      this.emitter.off('run_event', listener);
    };
  }

  subscribeToToolOutputChunk(listener: (payload: ToolOutputChunkPayload) => void): () => void {
    this.emitter.on('tool_output_chunk', listener);
    return () => {
      this.emitter.off('tool_output_chunk', listener);
    };
  }

  subscribeToToolOutputTerminal(listener: (payload: ToolOutputTerminalPayload) => void): () => void {
    this.emitter.on('tool_output_terminal', listener);
    return () => {
      this.emitter.off('tool_output_terminal', listener);
    };
  }

  emitToolOutputChunk(payload: ToolOutputChunkPayload): void {
    this.emitter.emit('tool_output_chunk', payload);
  }

  emitToolOutputTerminal(payload: ToolOutputTerminalPayload): void {
    this.emitter.emit('tool_output_terminal', payload);
  }

  subscribeToReminderCount(listener: (payload: ReminderCountEvent) => void): () => void {
    this.emitter.on('reminder_count', listener);
    return () => {
      this.emitter.off('reminder_count', listener);
    };
  }

  emitReminderCount(payload: ReminderCountEvent): void {
    this.emitter.emit('reminder_count', payload);
  }

  subscribeToNodeState(listener: (payload: NodeStateBusEvent) => void): () => void {
    this.emitter.on('node_state', listener);
    return () => {
      this.emitter.off('node_state', listener);
    };
  }

  emitNodeState(payload: NodeStateBusEvent): void {
    this.emitter.emit('node_state', payload);
  }

  subscribeToThreadCreated(listener: (thread: ThreadBroadcast) => void): () => void {
    this.emitter.on('thread_created', listener);
    return () => {
      this.emitter.off('thread_created', listener);
    };
  }

  emitThreadCreated(thread: ThreadBroadcast): void {
    this.emitter.emit('thread_created', thread);
  }

  subscribeToThreadUpdated(listener: (thread: ThreadBroadcast) => void): () => void {
    this.emitter.on('thread_updated', listener);
    return () => {
      this.emitter.off('thread_updated', listener);
    };
  }

  emitThreadUpdated(thread: ThreadBroadcast): void {
    this.emitter.emit('thread_updated', thread);
  }

  subscribeToMessageCreated(listener: (payload: { threadId: string; message: MessageBroadcast }) => void): () => void {
    this.emitter.on('message_created', listener);
    return () => {
      this.emitter.off('message_created', listener);
    };
  }

  emitMessageCreated(payload: { threadId: string; message: MessageBroadcast }): void {
    this.emitter.emit('message_created', payload);
  }

  subscribeToRunStatusChanged(listener: (payload: RunStatusBroadcast) => void): () => void {
    this.emitter.on('run_status_changed', listener);
    return () => {
      this.emitter.off('run_status_changed', listener);
    };
  }

  emitRunStatusChanged(payload: RunStatusBroadcast): void {
    this.emitter.emit('run_status_changed', payload);
  }

  subscribeToThreadMetrics(listener: (payload: ThreadMetricsEvent) => void): () => void {
    this.emitter.on('thread_metrics', listener);
    return () => {
      this.emitter.off('thread_metrics', listener);
    };
  }

  emitThreadMetrics(payload: ThreadMetricsEvent): void {
    this.emitter.emit('thread_metrics', payload);
  }

  subscribeToThreadMetricsAncestors(listener: (payload: ThreadMetricsAncestorsEvent) => void): () => void {
    this.emitter.on('thread_metrics_ancestors', listener);
    return () => {
      this.emitter.off('thread_metrics_ancestors', listener);
    };
  }

  emitThreadMetricsAncestors(payload: ThreadMetricsAncestorsEvent): void {
    this.emitter.emit('thread_metrics_ancestors', payload);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
