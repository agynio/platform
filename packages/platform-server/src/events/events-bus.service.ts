import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { RunEventsService } from './run-events.service';
import type { RunTimelineEvent, ToolOutputChunkPayload, ToolOutputTerminalPayload } from './run-events.service';

export type RunEventMutation = 'append' | 'update';

export type RunEventBusPayload = {
  eventId: string;
  mutation: RunEventMutation;
  event: RunTimelineEvent | null;
};

export type ReminderCountEvent = {
  nodeId: string;
  count: number;
  updatedAtMs?: number;
  threadId?: string;
};

type EventsBusEvents = {
  run_event: [RunEventBusPayload];
  tool_output_chunk: [ToolOutputChunkPayload];
  tool_output_terminal: [ToolOutputTerminalPayload];
  reminder_count: [ReminderCountEvent];
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

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
