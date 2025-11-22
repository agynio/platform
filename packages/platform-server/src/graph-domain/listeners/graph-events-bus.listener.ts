import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LoggerService } from '../../core/services/logger.service';
import { EventsBusService, type RunEventBusPayload } from '../../events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../../events/run-events.service';
import { GraphEventsPublisher } from '../../gateway/graph.events.publisher';

function toDate(value: string): Date | null {
  const ts = new Date(value);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

@Injectable()
export class GraphEventsBusListener implements OnModuleInit, OnModuleDestroy {
  private cleanup: Array<() => void> = [];
  private publisher: GraphEventsPublisher | null = null;

  constructor(
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePublisher();
    this.cleanup.push(this.eventsBus.subscribeToRunEvents(this.handleRunEvent));
    this.cleanup.push(this.eventsBus.subscribeToToolOutputChunk(this.handleToolOutputChunk));
    this.cleanup.push(this.eventsBus.subscribeToToolOutputTerminal(this.handleToolOutputTerminal));
  }

  onModuleDestroy(): void {
    for (const dispose of this.cleanup.splice(0)) {
      try {
        dispose();
      } catch (err) {
        this.logger.warn('GraphEventsBusListener cleanup failed', err);
      }
    }
  }

  private async ensurePublisher(): Promise<GraphEventsPublisher | null> {
    if (this.publisher) return this.publisher;
    try {
      const resolved = await this.moduleRef.resolve(GraphEventsPublisher, undefined, { strict: false });
      if (resolved) {
        this.publisher = resolved;
        return resolved;
      }
    } catch (err) {
      this.logger.warn('GraphEventsBusListener failed to resolve GraphEventsPublisher', err);
    }
    return null;
  }

  private readonly handleRunEvent = (payload: RunEventBusPayload): void => {
    const publisher = this.publisher;
    if (!publisher) {
      void this.ensurePublisher();
      return;
    }
    const event = payload.event;
    if (!event) {
      this.logger.warn('GraphEventsBusListener received run event payload without snapshot', {
        eventId: payload.eventId,
        mutation: payload.mutation,
      });
      return;
    }
    try {
      publisher.emitRunEvent(event.runId, event.threadId, {
        runId: event.runId,
        mutation: payload.mutation,
        event,
      });
    } catch (err) {
      this.logger.warn('GraphEventsBusListener failed to emit run event', {
        eventId: payload.eventId,
        mutation: payload.mutation,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  private readonly handleToolOutputChunk = (payload: ToolOutputChunkPayload): void => {
    const publisher = this.publisher;
    if (!publisher) {
      void this.ensurePublisher();
      return;
    }
    const ts = toDate(payload.ts);
    if (!ts) {
      this.logger.warn('GraphEventsBusListener received invalid chunk timestamp', {
        eventId: payload.eventId,
        ts: payload.ts,
      });
      return;
    }
    try {
      publisher.emitToolOutputChunk({
        runId: payload.runId,
        threadId: payload.threadId,
        eventId: payload.eventId,
        seqGlobal: payload.seqGlobal,
        seqStream: payload.seqStream,
        source: payload.source,
        ts,
        data: payload.data,
      });
    } catch (err) {
      this.logger.warn('GraphEventsBusListener failed to emit tool_output_chunk', {
        eventId: payload.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  private readonly handleToolOutputTerminal = (payload: ToolOutputTerminalPayload): void => {
    const publisher = this.publisher;
    if (!publisher) {
      void this.ensurePublisher();
      return;
    }
    const ts = toDate(payload.ts);
    if (!ts) {
      this.logger.warn('GraphEventsBusListener received invalid terminal timestamp', {
        eventId: payload.eventId,
        ts: payload.ts,
      });
      return;
    }
    try {
      publisher.emitToolOutputTerminal({
        runId: payload.runId,
        threadId: payload.threadId,
        eventId: payload.eventId,
        exitCode: payload.exitCode,
        status: payload.status,
        bytesStdout: payload.bytesStdout,
        bytesStderr: payload.bytesStderr,
        totalChunks: payload.totalChunks,
        droppedChunks: payload.droppedChunks,
        savedPath: payload.savedPath ?? undefined,
        message: payload.message ?? undefined,
        ts,
      });
    } catch (err) {
      this.logger.warn('GraphEventsBusListener failed to emit tool_output_terminal', {
        eventId: payload.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
