import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Scope } from '@nestjs/common';
import type { IncomingHttpHeaders, Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type ServerOptions, type Socket } from 'socket.io';
import { z } from 'zod';
import { LiveGraphRuntime } from '../graph-core/liveGraph.manager';
import type { MessageKind } from '@prisma/client';
import {
  EventsBusService,
  type MessageCreatedEvent,
  type NodeStateBusEvent,
  type ReminderCountEvent as ReminderCountBusEvent,
  type RunEventBroadcast,
  type RunEventBusPayload,
  type RunStatusBroadcast,
  type ThreadBroadcast,
  type ThreadMetricsAncestorsEvent,
  type ThreadMetricsEvent,
} from '../events/events-bus.service';
import type { ToolOutputChunkPayload, ToolOutputTerminalPayload } from '../events/run-events.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { PrismaService } from '../core/services/prisma.service';
import { ConfigService } from '../core/services/config.service';
import { AuthService } from '../auth/auth.service';

// Strict outbound event payloads
export const NodeStatusEventSchema = z
  .object({
    nodeId: z.string(),
    provisionStatus: z
      .object({
        state: z.enum([
          'not_ready',
          'provisioning',
          'ready',
          'deprovisioning',
          'provisioning_error',
          'deprovisioning_error',
        ]),
        details: z.unknown().optional(),
      })
      .partial(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type NodeStatusEvent = z.infer<typeof NodeStatusEventSchema>;

export const NodeStateEventSchema = z
  .object({
    nodeId: z.string(),
    state: z.record(z.string(), z.unknown()),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type NodeStateEvent = z.infer<typeof NodeStateEventSchema>;

// RemindMe: active reminder count event
export const ReminderCountSocketEventSchema = z
  .object({
    nodeId: z.string(),
    count: z.number().int().min(0),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ReminderCountSocketEvent = z.infer<typeof ReminderCountSocketEventSchema>;

export const ToolOutputChunkEventSchema = z
  .object({
    runId: z.string().uuid(),
    threadId: z.string().uuid(),
    eventId: z.string().uuid(),
    seqGlobal: z.number().int().positive(),
    seqStream: z.number().int().positive(),
    source: z.enum(['stdout', 'stderr']),
    ts: z.string().datetime(),
    data: z.string(),
  })
  .strict();
export type ToolOutputChunkEvent = z.infer<typeof ToolOutputChunkEventSchema>;

export const ToolOutputTerminalEventSchema = z
  .object({
    runId: z.string().uuid(),
    threadId: z.string().uuid(),
    eventId: z.string().uuid(),
    exitCode: z.number().int().nullable(),
    status: z.enum(['success', 'error', 'timeout', 'idle_timeout', 'cancelled', 'truncated']),
    bytesStdout: z.number().int().min(0),
    bytesStderr: z.number().int().min(0),
    totalChunks: z.number().int().min(0),
    droppedChunks: z.number().int().min(0),
    savedPath: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    ts: z.string().datetime(),
  })
  .strict();
export type ToolOutputTerminalEvent = z.infer<typeof ToolOutputTerminalEventSchema>;
/**
 * Socket.IO gateway attached to Fastify/Nest HTTP server for graph events.
 * Constructors DI-only; call init({ server }) explicitly from bootstrap.
 */
function toDate(value: string): Date | null {
  const ts = new Date(value);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

const RoomSchema = z.union([
  z.literal('threads'),
  z.literal('graph'),
  z.string().regex(/^thread:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^run:[0-9a-z-]{1,64}$/i),
  z.string().regex(/^node:[0-9a-z-]{1,64}$/i),
]);
const SubscribeSchema = z.object({ rooms: z.array(RoomSchema).optional(), room: RoomSchema.optional() }).strict();

@Injectable({ scope: Scope.DEFAULT })
export class GraphSocketGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphSocketGateway.name);
  private io: SocketIOServer | null = null;
  private initialized = false;
  private pendingThreads = new Set<string>();
  private metricsTimer: NodeJS.Timeout | null = null;
  private readonly COALESCE_MS = 100;
  private readonly cleanup: Array<() => void> = [];
  private readonly allowedOrigins: string[];
  private readonly threadOwnerCache = new Map<string, string>();

  constructor(
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {
    this.allowedOrigins = this.config.corsOrigins ?? [];
  }

  onModuleInit(): void {
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
  }

  onModuleDestroy(): void {
    for (const dispose of this.cleanup.splice(0)) {
      try {
        dispose();
      } catch (err) {
        this.logger.warn(
          `GraphSocketGateway: cleanup failed${this.formatContext({ error: this.toSafeError(err) })}`,
        );
      }
    }
  }

  /** Attach Socket.IO to the provided HTTP server. */
  init(params: { server: HTTPServer }): this {
    if (this.initialized) return this;
    const server = params.server;
    const options: Partial<ServerOptions> = {
      path: '/socket.io',
      transports: ['websocket'] as ServerOptions['transports'],
      cors: {
        origin: this.allowedOrigins.length ? this.allowedOrigins : true,
        credentials: true,
      },
      allowRequest: (req, callback) => {
        if (this.allowedOrigins.length === 0) {
          callback(null, true);
          return;
        }
        const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
        if (!originHeader || this.allowedOrigins.includes(originHeader)) {
          callback(null, true);
          return;
        }
        callback('forbidden_origin', false);
      },
    };
    this.io = new SocketIOServer(server, options);
    this.io.on('connection', (socket: Socket) => {
      void this.initializeSocket(socket);
    });
    this.initialized = true;
    // Wire runtime status events to socket broadcast
    this.attachRuntimeSubscriptions();
    return this;
  }

  private async initializeSocket(socket: Socket): Promise<void> {
    try {
      const principal = await this.authService.resolvePrincipalFromCookieHeader(
        socket.request.headers.cookie,
      );
      if (!principal) {
        this.logger.warn(
          `GraphSocketGateway: unauthorized connection${this.formatContext({ socketId: socket.id })}`,
        );
        socket.emit('error', { error: 'unauthorized' });
        socket.disconnect(true);
        return;
      }
      this.setupSocketHandlers(socket, principal.userId);
    } catch (error) {
      this.logger.warn(
        `GraphSocketGateway: connection setup failed${this.formatContext({
          socketId: socket.id,
          error: this.toSafeError(error),
        })}`,
      );
      socket.disconnect(true);
    }
  }

  private setupSocketHandlers(socket: Socket, userId: string): void {
    socket.on('subscribe', (payload: unknown, ack?: (response: unknown) => void) => {
      const parsed = SubscribeSchema.safeParse(payload);
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        }));
        this.logger.warn(
          `GraphSocketGateway: subscribe invalid${this.formatContext({ socketId: socket.id, issues: details })}`,
        );
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'invalid_payload', issues: details });
        }
        return;
      }
      const request = parsed.data;
      const requestedRooms: string[] = request.rooms ?? (request.room ? [request.room] : []);
      const joined: string[] = [];
      for (const room of requestedRooms) {
        if (!room) continue;
        const resolved = this.resolveRoomForUser(room, userId);
        if (!resolved) continue;
        socket.join(resolved);
        joined.push(room);
      }
      if (typeof ack === 'function') {
        ack({ ok: true, rooms: joined });
      }
    });
    socket.on('error', (e: unknown) => {
      this.logger.warn(
        `GraphSocketGateway: socket error${this.formatContext({
          socketId: socket.id,
          error: this.toSafeError(e),
        })}`,
      );
    });
  }

  private resolveRoomForUser(room: string, userId: string): string | null {
    if (this.isThreadScopedRoom(room)) {
      if (!userId) return null;
      return this.formatUserRoom(userId, room);
    }
    return room;
  }

  private isThreadScopedRoom(room: string): boolean {
    return room === 'threads' || room.startsWith('thread:') || room.startsWith('run:');
  }

  private formatUserRoom(userId: string, room: string): string {
    return `user:${userId}:${room}`;
  }

  private readonly handleRunEvent = (payload: RunEventBusPayload): void => {
    const event = payload.event;
    if (!event) {
      this.logger.warn(
        `GraphSocketGateway received run event payload without snapshot${this.formatContext({
          eventId: payload.eventId,
          mutation: payload.mutation,
        })}`,
      );
      return;
    }
    const broadcast: RunEventBroadcast = {
      runId: event.runId,
      mutation: payload.mutation,
      event,
    };
    void this.emitRunEvent(event.runId, event.threadId, broadcast).catch((err) => {
      this.logger.warn(
        `GraphSocketGateway failed to emit run event${this.formatContext({
          eventId: payload.eventId,
          mutation: payload.mutation,
          error: this.toSafeError(err),
        })}`,
      );
    });
  };

  private readonly handleToolOutputChunk = (payload: ToolOutputChunkPayload): void => {
    const ts = toDate(payload.ts);
    if (!ts) {
      this.logger.warn(
        `GraphSocketGateway received invalid chunk timestamp${this.formatContext({
          eventId: payload.eventId,
          ts: payload.ts,
        })}`,
      );
      return;
    }
    void this
      .emitToolOutputChunk({
        runId: payload.runId,
        threadId: payload.threadId,
        eventId: payload.eventId,
        seqGlobal: payload.seqGlobal,
        seqStream: payload.seqStream,
        source: payload.source,
        ts,
        data: payload.data,
      })
      .catch((err) => {
        this.logger.warn(
          `GraphSocketGateway failed to emit tool_output_chunk${this.formatContext({
            eventId: payload.eventId,
            error: this.toSafeError(err),
          })}`,
        );
      });
  };

  private readonly handleToolOutputTerminal = (payload: ToolOutputTerminalPayload): void => {
    const ts = toDate(payload.ts);
    if (!ts) {
      this.logger.warn(
        `GraphSocketGateway received invalid terminal timestamp${this.formatContext({
          eventId: payload.eventId,
          ts: payload.ts,
        })}`,
      );
      return;
    }
    void this
      .emitToolOutputTerminal({
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
      })
      .catch((err) => {
        this.logger.warn(
          `GraphSocketGateway failed to emit tool_output_terminal${this.formatContext({
            eventId: payload.eventId,
            error: this.toSafeError(err),
          })}`,
        );
      });
  };

  private readonly handleReminderCount = (payload: ReminderCountBusEvent): void => {
    try {
      this.emitReminderCount(payload.nodeId, payload.count, payload.updatedAtMs);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit reminder_count${this.formatContext({
          nodeId: payload.nodeId,
          error: this.toSafeError(err),
        })}`,
      );
      return;
    }

    const threadId = payload.threadId;
    if (!threadId) return;

    let scheduleResult: void | Promise<void>;
    try {
      scheduleResult = this.scheduleThreadAndAncestorsMetrics(threadId);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to schedule metrics from reminder count${this.formatContext({
          nodeId: payload.nodeId,
          threadId,
          error: this.toSafeError(err),
        })}`,
      );
      return;
    }

    void Promise.resolve(scheduleResult).catch((err) => {
      this.logger.warn(
        `GraphSocketGateway failed to schedule metrics from reminder count${this.formatContext({
          nodeId: payload.nodeId,
          threadId,
          error: this.toSafeError(err),
        })}`,
      );
    });
  };

  private readonly handleNodeState = (payload: NodeStateBusEvent): void => {
    try {
      this.emitNodeState(payload.nodeId, payload.state, payload.updatedAtMs);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit node_state${this.formatContext({
          nodeId: payload.nodeId,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleThreadCreated = (thread: ThreadBroadcast): void => {
    try {
      this.emitThreadCreated(thread);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit thread_created${this.formatContext({
          threadId: thread.id,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleThreadUpdated = (thread: ThreadBroadcast): void => {
    try {
      this.emitThreadUpdated(thread);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit thread_updated${this.formatContext({
          threadId: thread.id,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleMessageCreated = (payload: MessageCreatedEvent): void => {
    try {
      this.logger.log(
        `new message${this.formatContext({
          threadId: payload.threadId,
          messageId: payload.message.id,
          kind: payload.message.kind,
          runId: payload.message.runId ?? null,
        })}`,
      );
      this.emitMessageCreated(payload.threadId, payload.ownerUserId, payload.message);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit message_created${this.formatContext({
          threadId: payload.threadId,
          messageId: payload.message.id,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleRunStatusChanged = (payload: RunStatusBroadcast): void => {
    try {
      this.emitRunStatusChanged(payload);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to emit run_status_changed${this.formatContext({
          threadId: payload.threadId,
          runId: payload.run.id,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleThreadMetrics = (payload: ThreadMetricsEvent): void => {
    try {
      this.scheduleThreadMetrics(payload.threadId);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to schedule thread metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(err),
        })}`,
      );
    }
  };

  private readonly handleThreadMetricsAncestors = (payload: ThreadMetricsAncestorsEvent): void => {
    let scheduleResult: void | Promise<void>;
    try {
      scheduleResult = this.scheduleThreadAndAncestorsMetrics(payload.threadId);
    } catch (err) {
      this.logger.warn(
        `GraphSocketGateway failed to schedule ancestor thread metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(err),
        })}`,
      );
      return;
    }

    void Promise.resolve(scheduleResult).catch((err) => {
      this.logger.warn(
        `GraphSocketGateway failed to schedule ancestor thread metrics${this.formatContext({
          threadId: payload.threadId,
          error: this.toSafeError(err),
        })}`,
      );
    });
  };

  private broadcast<T extends { nodeId: string }>(
    event: 'node_status' | 'node_state' | 'node_reminder_count',
    payload: T,
    schema: z.ZodType<T>,
  ) {
    if (!this.io) return;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error(
        `Gateway payload validation failed${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    const data = parsed.data;
    this.emitToRooms(['graph', `node:${data.nodeId}`], event, data);
  }

  private attachRuntimeSubscriptions() {
    // Subscribe via runtime forwarder
    this.runtime.subscribe((ev) => {
      const payload: NodeStatusEvent = {
        nodeId: ev.nodeId,
        provisionStatus: { state: ev.next as NodeStatusEvent['provisionStatus']['state'] },
        updatedAt: new Date(ev.at).toISOString(),
      };
      this.broadcast('node_status', payload, NodeStatusEventSchema);
    });
  }

  // Note: node-level subscription handled via runtime.subscribe()

  /** Emit node_state event when NodeStateService updates runtime snapshot. Public for DI bridge usage. */
  emitNodeState(nodeId: string, state: Record<string, unknown>, updatedAtMs?: number): void {
    const payload: NodeStateEvent = {
      nodeId,
      state,
      updatedAt: new Date(updatedAtMs ?? Date.now()).toISOString(),
    };
    this.broadcast('node_state', payload, NodeStateEventSchema);
  }
  /** Emit node_reminder_count event for RemindMe tool nodes when registry changes. */
  emitReminderCount(nodeId: string, count: number, updatedAtMs?: number): void {
    const payload: ReminderCountSocketEvent = {
      nodeId,
      count,
      updatedAt: new Date(updatedAtMs ?? Date.now()).toISOString(),
    };
    this.broadcast('node_reminder_count', payload, ReminderCountSocketEventSchema);
  }

  // Threads realtime events
  emitThreadCreated(thread: ThreadBroadcast) {
    this.rememberThreadOwner(thread.id, thread.ownerUserId);
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.emitToUserRooms(thread.ownerUserId, ['threads'], 'thread_created', payload);
  }
  emitThreadUpdated(thread: ThreadBroadcast) {
    this.rememberThreadOwner(thread.id, thread.ownerUserId);
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.emitToUserRooms(thread.ownerUserId, ['threads', `thread:${thread.id}`], 'thread_updated', payload);
  }
  emitMessageCreated(
    threadId: string,
    ownerUserId: string,
    message: { id: string; kind: MessageKind; text: string | null; source: import('type-fest').JsonValue | unknown; createdAt: Date; runId?: string },
  ) {
    const payload = { threadId, message: { ...message, createdAt: message.createdAt.toISOString() } };
    this.rememberThreadOwner(threadId, ownerUserId);
    this.emitToUserRooms(ownerUserId, [`thread:${threadId}`], 'message_created', payload);
  }
  emitRunStatusChanged(payload: RunStatusBroadcast) {
    const eventPayload = {
      threadId: payload.threadId,
      run: {
        ...payload.run,
        threadId: payload.threadId,
        createdAt: payload.run.createdAt.toISOString(),
        updatedAt: payload.run.updatedAt.toISOString(),
      },
    };
    this.rememberThreadOwner(payload.threadId, payload.ownerUserId);
    this.emitToUserRooms(payload.ownerUserId, [`thread:${payload.threadId}`, `run:${payload.run.id}`], 'run_status_changed', eventPayload);
  }
  async emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast) {
    const eventName = payload.mutation === 'update' ? 'run_event_updated' : 'run_event_appended';
    await this.emitThreadRooms(threadId, [`run:${runId}`, `thread:${threadId}`], eventName, payload);
  }
  async emitToolOutputChunk(payload: {
    runId: string;
    threadId: string;
    eventId: string;
    seqGlobal: number;
    seqStream: number;
    source: 'stdout' | 'stderr';
    ts: Date;
    data: string;
  }) {
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
        `Gateway payload validation failed for tool_output_chunk${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    await this.emitThreadRooms(eventPayload.threadId, [`run:${eventPayload.runId}`, `thread:${eventPayload.threadId}`], 'tool_output_chunk', eventPayload);
  }
  async emitToolOutputTerminal(payload: {
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
  }) {
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
        `Gateway payload validation failed for tool_output_terminal${this.formatContext({ issues: parsed.error.issues })}`,
      );
      return;
    }
    await this.emitThreadRooms(eventPayload.threadId, [`run:${eventPayload.runId}`, `thread:${eventPayload.threadId}`], 'tool_output_terminal', eventPayload);
  }
  private flushMetricsQueue = async () => {
    // De-duplicate pending thread IDs per flush (preserve insertion order)
    const ids = Array.from(new Set(this.pendingThreads));
    this.pendingThreads.clear();
    this.metricsTimer = null;
    if (!this.io || ids.length === 0) return;
    try {
      const map = await this.metrics.getThreadsMetrics(ids);
      for (const id of ids) {
        const m = map[id];
        if (!m) continue;
        const ownerUserId = await this.getThreadOwnerId(id);
        if (!ownerUserId) continue;
        const activityPayload = { threadId: id, activity: m.activity };
        const remindersPayload = { threadId: id, remindersCount: m.remindersCount };
        const rooms = ['threads', `thread:${id}`];
        this.emitToUserRooms(ownerUserId, rooms, 'thread_activity_changed', activityPayload);
        this.emitToUserRooms(ownerUserId, rooms, 'thread_reminders_count', remindersPayload);
      }
    } catch (e) {
      this.logger.error(`flushMetricsQueue error${this.formatContext({ error: this.toSafeError(e) })}`);
    }
  };
  scheduleThreadMetrics(threadId: string) {
    this.pendingThreads.add(threadId);
    if (!this.metricsTimer) this.metricsTimer = setTimeout(this.flushMetricsQueue, this.COALESCE_MS);
  }
  async scheduleThreadAndAncestorsMetrics(threadId: string) {
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
      for (const r of rows) this.scheduleThreadMetrics(r.id);
    } catch (e) {
      this.logger.error(
        `scheduleThreadAndAncestorsMetrics error${this.formatContext({ error: this.toSafeError(e) })}`,
      );
      this.scheduleThreadMetrics(threadId);
    }
  }

  private sanitizeHeaders(headers: IncomingHttpHeaders | undefined): Record<string, unknown> {
    if (!headers) return {};
    const sensitive = new Set(['authorization', 'cookie', 'set-cookie']);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      sanitized[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  private sanitizeQuery(query: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!query) return {};
    const sensitive = new Set(['token', 'authorization', 'auth', 'api_key', 'access_token']);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      sanitized[key] = key && sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  private emitToRooms(
    rooms: string[],
    event: string,
    payload: unknown,
  ) {
    if (!this.io || rooms.length === 0) return;
    for (const room of rooms) {
      try {
        this.io.to(room).emit(event, payload);
      } catch (error) {
        const errPayload =
          error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
        this.logger.warn(
          `GraphSocketGateway: emit error ${this.formatContext({ event, room, error: errPayload })}`,
        );
      }
    }
  }

  private emitToUserRooms(userId: string, rooms: string[], event: string, payload: unknown): void {
    if (!userId) return;
    const resolved = rooms.map((room) => this.formatUserRoom(userId, room));
    this.emitToRooms(resolved, event, payload);
  }

  private async emitThreadRooms(
    threadId: string,
    rooms: string[],
    event: string,
    payload: unknown,
  ): Promise<void> {
    const ownerUserId = await this.getThreadOwnerId(threadId);
    if (!ownerUserId) return;
    this.emitToUserRooms(ownerUserId, rooms, event, payload);
  }

  private async getThreadOwnerId(threadId: string): Promise<string | null> {
    if (!threadId) return null;
    const cached = this.threadOwnerCache.get(threadId);
    if (cached) return cached;
    const prisma = this.prismaService.getClient();
    const repository = prisma?.thread;
    if (!repository?.findUnique) return null;
    const row = await repository.findUnique({ where: { id: threadId }, select: { ownerUserId: true } });
    if (!row?.ownerUserId) return null;
    this.threadOwnerCache.set(threadId, row.ownerUserId);
    return row.ownerUserId;
  }

  private rememberThreadOwner(threadId: string, ownerUserId: string | null | undefined): void {
    if (!threadId || !ownerUserId) return;
    this.threadOwnerCache.set(threadId, ownerUserId);
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
