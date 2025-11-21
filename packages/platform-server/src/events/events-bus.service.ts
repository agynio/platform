import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { RunEventsService } from './run-events.service';
import type { RunTimelineEvent } from './run-events.service';

export type RunEventMutation = 'append' | 'update';

export type RunEventBusPayload = {
  eventId: string;
  mutation: RunEventMutation;
  event: RunTimelineEvent | null;
};

type EventsBusEvents = {
  run_event: [RunEventBusPayload];
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

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
