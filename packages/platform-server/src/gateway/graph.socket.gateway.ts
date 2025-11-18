import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import type { IncomingHttpHeaders, Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type ServerOptions, type Socket } from 'socket.io';
import { z } from 'zod';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from '../graph/liveGraph.manager';
import type { ThreadStatus, MessageKind, RunStatus } from '@prisma/client';
import type { GraphEventsPublisher, RunEventBroadcast } from './graph.events.publisher';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { PrismaService } from '../core/services/prisma.service';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import type { GraphEventsPublisherAware } from './graph.events.publisher';

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
export const ReminderCountEventSchema = z
  .object({
    nodeId: z.string(),
    count: z.number().int().min(0),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ReminderCountEvent = z.infer<typeof ReminderCountEventSchema>;
/**
 * Socket.IO gateway attached to Fastify/Nest HTTP server for graph events.
 * Constructors DI-only; call init({ server }) explicitly from bootstrap.
 */
@Injectable({ scope: Scope.DEFAULT })
export class GraphSocketGateway implements GraphEventsPublisher {
  private io: SocketIOServer | null = null;
  private initialized = false;
  private pendingThreads = new Set<string>();
  private metricsTimer: NodeJS.Timeout | null = null;
  private readonly COALESCE_MS = 100;

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(ThreadsMetricsService) private readonly metrics: ThreadsMetricsService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Optional() @Inject(AgentsPersistenceService) persistence?: GraphEventsPublisherAware,
  ) {
    persistence?.setEventsPublisher(this);
  }

  /** Attach Socket.IO to the provided HTTP server. */
  init(params: { server: HTTPServer }): this {
    if (this.initialized) return this;
    const server = params.server;
    const options: Partial<ServerOptions> = {
      path: '/socket.io',
      transports: ['websocket'] as ServerOptions['transports'],
      cors: { origin: '*' },
    };
    this.logger.info('GraphSocketGateway: attach');
    this.logger.info('GraphSocketGateway: options', {
      path: options.path,
      transports: Array.isArray(options.transports) ? [...options.transports] : options.transports,
    });
    this.io = new SocketIOServer(server, options);
    this.io.on('connection', (socket: Socket) => {
      this.logger.info('GraphSocketGateway: connection', {
        socketId: socket.id,
        handshake: {
          query: this.sanitizeQuery(socket.handshake.query as Record<string, unknown>),
          headers: this.sanitizeHeaders(socket.handshake.headers),
        },
      });
      // Room subscription
      const RoomSchema = z.union([
        z.literal('threads'),
        z.literal('graph'),
        z.string().regex(/^thread:[0-9a-f-]{36}$/i),
        z.string().regex(/^run:[0-9a-f-]{36}$/i),
        z.string().regex(/^node:[0-9a-f-]{36}$/i),
      ]);
      const SubscribeSchema = z
        .object({ rooms: z.array(RoomSchema).optional(), room: RoomSchema.optional() })
        .strict();
      socket.on('subscribe', (payload: unknown, ack?: (response: unknown) => void) => {
        const parsed = SubscribeSchema.safeParse(payload);
        if (!parsed.success) {
          const details = parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
            code: issue.code,
          }));
          this.logger.warn('GraphSocketGateway: subscribe invalid', { socketId: socket.id, issues: details });
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'invalid_payload', issues: details });
          }
          return;
        }
        const p = parsed.data;
        const rooms: string[] = p.rooms ?? (p.room ? [p.room] : []);
        this.logger.info('GraphSocketGateway: subscribe', { socketId: socket.id, payload: p });
        for (const r of rooms) if (r.length > 0) socket.join(r);
        if (rooms.length > 0) {
          this.logger.info('GraphSocketGateway: subscribed', { socketId: socket.id, rooms });
        }
        if (typeof ack === 'function') {
          ack({ ok: true, rooms });
        }
      });
      socket.on('disconnect', (reason) => {
        this.logger.info('GraphSocketGateway: disconnect', { socketId: socket.id, reason });
      });
      socket.on('error', (e: unknown) => {
        this.logger.warn('GraphSocketGateway: socket error', {
          socketId: socket.id,
          error: this.toSafeError(e),
        });
      });
    });
    this.initialized = true;
    // Wire runtime status events to socket broadcast
    this.attachRuntimeSubscriptions();
    this.logger.info('GraphSocketGateway initialized and attached at /socket.io');
    return this;
  }

  private broadcast<T extends { nodeId: string }>(
    event: 'node_status' | 'node_state' | 'node_reminder_count',
    payload: T,
    schema: z.ZodType<T>,
  ) {
    if (!this.io) return;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error('Gateway payload validation failed', parsed.error.issues);
      return;
    }
    const data = parsed.data;
    this.emitToRooms(['graph', `node:${data.nodeId}`], event, data, () => ({ nodeId: data.nodeId }));
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
    const payload: ReminderCountEvent = {
      nodeId,
      count,
      updatedAt: new Date(updatedAtMs ?? Date.now()).toISOString(),
    };
    this.broadcast('node_reminder_count', payload, ReminderCountEventSchema);
  }

  // Threads realtime events
  emitThreadCreated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }) {
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.emitToRooms(['threads'], 'thread_created', payload, () => ({ threadId: thread.id }));
  }
  emitThreadUpdated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }) {
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.emitToRooms(['threads'], 'thread_updated', payload, () => ({ threadId: thread.id }));
  }
  emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: import('type-fest').JsonValue | unknown; createdAt: Date; runId?: string }) {
    const payload = { threadId, message: { ...message, createdAt: message.createdAt.toISOString() } };
    this.emitToRooms([`thread:${threadId}`], 'message_created', payload, () => ({ threadId, messageId: message.id }));
  }
  emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }) {
    const payload = {
      threadId,
      run: {
        ...run,
        threadId,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      },
    };
    this.emitToRooms([`thread:${threadId}`, `run:${run.id}`], 'run_status_changed', payload, () => ({ threadId, runId: run.id, status: run.status }));
  }
  emitRunEvent(runId: string, threadId: string, payload: RunEventBroadcast) {
    this.emitToRooms([`run:${runId}`, `thread:${threadId}`], 'run_event_appended', payload, () => {
      const event = (payload.event ?? {}) as { id?: string; ts?: string; type?: string };
      return { threadId, runId, eventId: event.id, eventType: event.type, ts: event.ts };
    });
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
        const activityPayload = { threadId: id, activity: m.activity };
        this.emitToRooms(['threads', `thread:${id}`], 'thread_activity_changed', activityPayload, () => ({ threadId: id, activity: m.activity }));
        const remindersPayload = { threadId: id, remindersCount: m.remindersCount };
        this.emitToRooms(['threads', `thread:${id}`], 'thread_reminders_count', remindersPayload, () => ({ threadId: id, remindersCount: m.remindersCount }));
      }
    } catch (e) {
      this.logger.error('flushMetricsQueue error', e);
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
      this.logger.error('scheduleThreadAndAncestorsMetrics error', e);
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
    summaryFactory: () => Record<string, unknown>,
  ) {
    if (!this.io || rooms.length === 0) return;
    let summary: Record<string, unknown> = {};
    try {
      summary = summaryFactory();
    } catch (error) {
      summary = { summaryError: error instanceof Error ? { message: error.message, name: error.name } : error };
    }
    this.logger.info('GraphSocketGateway: emit', { event, rooms, ...summary });
    for (const room of rooms) {
      try {
        this.io.to(room).emit(event, payload);
      } catch (error) {
        const errPayload =
          error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
        this.logger.warn('GraphSocketGateway: emit error', { event, room, error: errPayload });
      }
    }
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
