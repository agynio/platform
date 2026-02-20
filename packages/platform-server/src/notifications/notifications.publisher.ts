import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NotificationEnvelope, NotificationRoom } from '@agyn/shared';
import { z } from 'zod';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { PrismaService } from '../core/services/prisma.service';
import {
  EventsBusService,
  type MessageBroadcast,
  type NodeStateBusEvent,
  type ReminderCountEvent,
  type RunEventBroadcast,
  type RunEventBusPayload,
  type RunStatusBroadcast,
  type ThreadBroadcast,
  type ThreadMetricsAncestorsEvent,
  type ThreadMetricsEvent,
} from '../events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../events/run-events.service';
import type { MessageKind, RunStatus, ThreadStatus } from '@prisma/client';
import { NotificationsBroker } from './notifications.broker';
import {
  NodeStateEventSchema,
  NodeStatusEventSchema,
  ReminderCountSocketEventSchema,
  ToolOutputChunkEventSchema,
  ToolOutputTerminalEventSchema,
  type NodeStateEvent,
  type NodeStatusEvent,
  type ReminderCountSocketEvent,
  type ToolOutputChunkEvent,
  type ToolOutputTerminalEvent,
} from './notifications.schemas';

@Injectable()
export class NotificationsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsPublisher.name);
  private readonly cleanup: Array<() => void> = [];
  private runtimeDispose: (() => void) | null = null;
  private pendingThreads = new Set<string>();
  private metricsTimer: NodeJS.Timeout | null = null;
  private readonly COALESCE_MS = 100;

  constructor(
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(NotificationsBroker) private readonly broker: NotificationsBroker,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.broker.connect();
    this.cleanup.push(this.eventsBus.subscribeToRunEvents(this.handleRunEvent));
    this.cleanup.push(this.eventsBus.subscribeToToolOutputChunk(this.handleToolOutputChunk));
    this.cleanup.push(this.eventsBus.subscribeToToolOutputTerminal(this.handleToolOutputTerminal));
    this.cleanup.push(this.eventsBus.subscribeToReminderCount(this.handleReminderCount));
    this.cleanup.push(this.eventsBus.subscribeToNodeState(this.handleNodeState));
    this.cleanup.push(this.eventsBus.subscribeToThreadCreated(this.handleThreadCreated));
    this.cleanup.push(this.eventsBus.subscribeToThreadUpdated(this.handleThreadUpdated));
    this.cleanup.push(this.eventsBus.subscribeToMessageCreated(this.handleMessageCreated));
    this.cleanup.push(this.eventsBus.subscribeToRunStatusChanged(this.handleRunStatusChanged));
    this.cleanup.push(this.eventsBus.subscribeToThreadMetrics(this.handleThreadMetrics));
    this.cleanup.push(this.eventsBus.subscribeToThreadMetricsAncestors(this.handleThreadMetricsAncestors));
    this.runtimeDispose = this.runtime.subscribe((ev) => {
      const payload: NodeStatusEvent = {
        nodeId: ev.nodeId,
        provisionStatus: { state: ev.next as NodeStatusEvent['provisionStatus']['state'] },
        updatedAt: new Date(ev.at).toISOString(),
      };
      this.broadcast('node_status', payload, NodeStatusEventSchema);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const dispose of this.cleanup.splice(0)) {
      try {
        dispose();
      } catch (error) {
        this.logger.warn(
          `NotificationsPublisher cleanup failed${this.formatContext({ error: this.toSafeError(error) })}`,
        );
      }
    }
    if (this.runtimeDispose) {
      try {
        this.runtimeDispose();
      } catch (error) {
        this.logger.warn(
          `NotificationsPublisher runtime dispose failed${this.formatContext({ error: this.toSafeError(error) })}`,
        );
      }
      this.runtimeDispose = null;
    }
    if (this.metricsTimer) {
      clearTimeout(this.metricsTimer);
      this.metricsTimer = null;
    }
    await this.broker.close();
  }

  private readonly handleRunEvent = (payload: RunEventBusPayload): void => {
    const event = payload.event;
    if (!event) {
      this.logger.warn(
        `NotificationsPublisher run event missing snapshot${this.formatContext({
          eventId: payload.eventId,
          mutation: payload.mutation,
        })}`,
      );
      return;
    }
    try {
      const broadcast: RunEventBroadcast = {
        runId: event.runId,
        mutation: payload.mutation,
        event,
      };
      this.emitRunEvent(event.runId, event.threadId, broadcast);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit run event${this.formatContext({
          eventId: payload.eventId,
          mutation: payload.mutation,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleToolOutputChunk = (payload: ToolOutputChunkPayload): void => {
    const ts = this.toDate(payload.ts);
    if (!ts) {
      this.logger.warn(
        `NotificationsPublisher received invalid chunk timestamp${this.formatContext({
          eventId: payload.eventId,
          ts: payload.ts,
        })}`,
      );
      return;
    }
    try {
      this.emitToolOutputChunk({
        runId: payload.runId,
        threadId: payload.threadId,
        eventId: payload.eventId,
        seqGlobal: payload.seqGlobal,
        seqStream: payload.seqStream,
        source: payload.source,
        ts,
        data: payload.data,
      });
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit tool_output_chunk${this.formatContext({
          eventId: payload.eventId,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleToolOutputTerminal = (payload: ToolOutputTerminalPayload): void => {
    const ts = this.toDate(payload.ts);
    if (!ts) {
      this.logger.warn(
        `NotificationsPublisher received invalid terminal timestamp${this.formatContext({
          eventId: payload.eventId,
          ts: payload.ts,
        })}`,
      );
      return;
    }
    try {
      this.emitToolOutputTerminal({
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
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit tool_output_terminal${this.formatContext({
          eventId: payload.eventId,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleReminderCount = (payload: ReminderCountEvent): void => {
    try {
      this.emitReminderCount(payload.nodeId, payload.count, payload.updatedAtMs);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit reminder_count${this.formatContext({
          nodeId: payload.nodeId,
          error: this.toSafeError(error),
        })}`,
      );
      return;
    }

    const threadId = payload.threadId;
    if (!threadId) return;

    let scheduled: void | Promise<void>;
    try {
      scheduled = this.scheduleThreadAndAncestorsMetrics(threadId);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to schedule metrics from reminder${this.formatContext({
          nodeId: payload.nodeId,
          threadId,
          error: this.toSafeError(error),
        })}`,
      );
      return;
    }

    void Promise.resolve(scheduled).catch((error) => {
      this.logger.warn(
        `NotificationsPublisher failed async metrics scheduling${this.formatContext({
          threadId,
          error: this.toSafeError(error),
        })}`,
      );
    });
  };

  private readonly handleNodeState = (payload: NodeStateBusEvent): void => {
    try {
      this.emitNodeState(payload.nodeId, payload.state, payload.updatedAtMs);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit node_state${this.formatContext({
          nodeId: payload.nodeId,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleThreadCreated = (thread: ThreadBroadcast): void => {
    try {
      this.emitThreadCreated(thread);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit thread_created${this.formatContext({
          threadId: thread.id,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleThreadUpdated = (thread: ThreadBroadcast): void => {
    try {
      this.emitThreadUpdated(thread);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit thread_updated${this.formatContext({
          threadId: thread.id,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleMessageCreated = (payload: { threadId: string; message: MessageBroadcast }): void => {
    try {
      this.emitMessageCreated(payload.threadId, payload.message);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit message_created${this.formatContext({
          threadId: payload.threadId,
          messageId: payload.message.id,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleRunStatusChanged = (payload: RunStatusBroadcast): void => {
    try {
      this.emitRunStatusChanged(payload.threadId, payload.run);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to emit run_status_changed${this.formatContext({
          threadId: payload.threadId,
          runId: payload.run.id,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleThreadMetrics = (payload: ThreadMetricsEvent): void => {
    try {
      this.scheduleThreadMetrics(payload.threadId);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to schedule thread metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(error),
        })}`,
      );
    }
  };

  private readonly handleThreadMetricsAncestors = (payload: ThreadMetricsAncestorsEvent): void => {
    let scheduled: void | Promise<void>;
    try {
      scheduled = this.scheduleThreadAndAncestorsMetrics(payload.threadId);
    } catch (error) {
      this.logger.warn(
        `NotificationsPublisher failed to schedule ancestor metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(error),
        })}`,
      );
      return;
    }

    void Promise.resolve(scheduled).catch((error) => {
      this.logger.warn(
        `NotificationsPublisher failed async ancestor metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(error),
        })}`,
      );
    });
  };

  private broadcast<T extends { nodeId: string }>(event: string, payload: T, schema: z.ZodType<T>): void {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error(
        `NotificationsPublisher payload validation failed${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    const data = parsed.data;
    void this.publishToRooms(['graph', `node:${data.nodeId}`], event, data);
  }

  private emitNodeState(nodeId: string, state: Record<string, unknown>, updatedAtMs?: number): void {
    const payload: NodeStateEvent = {
      nodeId,
      state,
      updatedAt: new Date(updatedAtMs ?? Date.now()).toISOString(),
    };
    this.broadcast('node_state', payload, NodeStateEventSchema);
  }

  private emitReminderCount(nodeId: string, count: number, updatedAtMs?: number): void {
    const payload: ReminderCountSocketEvent = {
      nodeId,
      count,
      updatedAt: new Date(updatedAtMs ?? Date.now()).toISOString(),
    };
    this.broadcast('node_reminder_count', payload, ReminderCountSocketEventSchema);
  }

  private emitThreadCreated(thread: {
    id: string;
    alias: string;
    summary: string | null;
    status: ThreadStatus;
    createdAt: Date;
    parentId?: string | null;
    channelNodeId?: string | null;
    assignedAgentNodeId?: string | null;
  }): void {
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    void this.publishToRooms(['threads'], 'thread_created', payload);
  }

  private emitThreadUpdated(thread: {
    id: string;
    alias: string;
    summary: string | null;
    status: ThreadStatus;
    createdAt: Date;
    parentId?: string | null;
    channelNodeId?: string | null;
    assignedAgentNodeId?: string | null;
  }): void {
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    void this.publishToRooms(['threads'], 'thread_updated', payload);
  }

  private emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: unknown; createdAt: Date; runId?: string }): void {
    const payload = { threadId, message: { ...message, createdAt: message.createdAt.toISOString() } };
    void this.publishToRooms([`thread:${threadId}`], 'message_created', payload);
  }

  private emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }): void {
    const payload = {
      threadId,
      run: {
        ...run,
        threadId,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      },
    };
    void this.publishToRooms([`thread:${threadId}`, `run:${run.id}`], 'run_status_changed', payload);
  }

  private emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast): void {
    const eventName = payload.mutation === 'update' ? 'run_event_updated' : 'run_event_appended';
    void this.publishToRooms([`run:${runId}`, `thread:${threadId}`], eventName, payload);
  }

  private emitToolOutputChunk(payload: {
    runId: string;
    threadId: string;
    eventId: string;
    seqGlobal: number;
    seqStream: number;
    source: 'stdout' | 'stderr';
    ts: Date;
    data: string;
  }): void {
    const eventPayload: ToolOutputChunkEvent = {
      runId: payload.runId,
      threadId: payload.threadId,
      eventId: payload.eventId,
      seqGlobal: payload.seqGlobal,
      seqStream: payload.seqStream,
      source: payload.source,
      ts: payload.ts.toISOString(),
      data: payload.data,
    };
    const parsed = ToolOutputChunkEventSchema.safeParse(eventPayload);
    if (!parsed.success) {
      this.logger.error(
        `NotificationsPublisher payload validation failed for tool_output_chunk${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    void this.publishToRooms([`run:${payload.runId}`, `thread:${payload.threadId}`], 'tool_output_chunk', parsed.data);
  }

  private emitToolOutputTerminal(payload: {
    runId: string;
    threadId: string;
    eventId: string;
    exitCode: number | null;
    status: 'success' | 'error' | 'timeout' | 'idle_timeout' | 'cancelled' | 'truncated';
    bytesStdout: number;
    bytesStderr: number;
    totalChunks: number;
    droppedChunks: number;
    savedPath?: string;
    message?: string;
    ts: Date;
  }): void {
    const eventPayload: ToolOutputTerminalEvent = {
      runId: payload.runId,
      threadId: payload.threadId,
      eventId: payload.eventId,
      exitCode: payload.exitCode,
      status: payload.status,
      bytesStdout: payload.bytesStdout,
      bytesStderr: payload.bytesStderr,
      totalChunks: payload.totalChunks,
      droppedChunks: payload.droppedChunks,
      savedPath: payload.savedPath ?? null,
      message: payload.message ?? null,
      ts: payload.ts.toISOString(),
    };
    const parsed = ToolOutputTerminalEventSchema.safeParse(eventPayload);
    if (!parsed.success) {
      this.logger.error(
        `NotificationsPublisher payload validation failed for tool_output_terminal${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    void this.publishToRooms([`run:${payload.runId}`, `thread:${payload.threadId}`], 'tool_output_terminal', parsed.data);
  }

  scheduleThreadMetrics(threadId: string): void {
    this.pendingThreads.add(threadId);
    if (!this.metricsTimer) {
      this.metricsTimer = setTimeout(this.flushMetricsQueue, this.COALESCE_MS);
    }
  }

  async scheduleThreadAndAncestorsMetrics(threadId: string): Promise<void> {
    try {
      const prisma = this.prismaService.getClient();
      const rows: Array<{ id: string; parentId: string | null }> = await prisma.$queryRaw<Array<{ id: string; parentId: string | null }>>`
        with recursive rec as (
          select t.id, t."parentId" from "Thread" t where t.id = ${threadId}::uuid
          union all
          select p.id, p."parentId" from "Thread" p join rec r on r."parentId" = p.id
        )
        select id, "parentId" from rec;
      `;
      for (const row of rows) this.scheduleThreadMetrics(row.id);
    } catch (error) {
      this.logger.error(
        `NotificationsPublisher scheduleThreadAndAncestorsMetrics error${this.formatContext({ error: this.toSafeError(error) })}`,
      );
      this.scheduleThreadMetrics(threadId);
    }
  }

  private readonly flushMetricsQueue = async (): Promise<void> => {
    const ids = Array.from(new Set(this.pendingThreads));
    this.pendingThreads.clear();
    this.metricsTimer = null;
    if (!ids.length) return;
    try {
      const map = await this.metrics.getThreadsMetrics(ids);
      for (const id of ids) {
        const metrics = map[id];
        if (!metrics) continue;
        void this.publishToRooms(['threads', `thread:${id}`], 'thread_activity_changed', {
          threadId: id,
          activity: metrics.activity,
        });
        void this.publishToRooms(['threads', `thread:${id}`], 'thread_reminders_count', {
          threadId: id,
          remindersCount: metrics.remindersCount,
        });
      }
    } catch (error) {
      this.logger.error(
        `NotificationsPublisher flushMetricsQueue error${this.formatContext({ error: this.toSafeError(error) })}`,
      );
    }
  };

  private toDate(value: string): Date | null {
    const ts = new Date(value);
    return Number.isNaN(ts.getTime()) ? null : ts;
  }

  private async publishToRooms(rooms: NotificationRoom[], event: string, payload: unknown): Promise<void> {
    if (!rooms.length) return;
    const envelope: NotificationEnvelope = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      source: 'platform-server',
      rooms,
      event,
      payload,
    };
    try {
      await this.broker.publish(envelope);
    } catch (error) {
      this.logger.error(
        `NotificationsPublisher failed to publish${this.formatContext({ event, rooms, error: this.toSafeError(error) })}`,
      );
    }
  }

  private formatContext(context: Record<string, unknown>): string {
    return ` ${JSON.stringify(context)}`;
  }

  private toSafeError(error: unknown): { name?: string; message: string } {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }
}
