import { Inject, Injectable, Scope } from '@nestjs/common';
import type { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from '../graph/liveGraph.manager';
import { PrismaService } from '../core/services/prisma.service';
import type { ThreadStatus, MessageKind, RunStatus } from '@prisma/client';

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
export class GraphSocketGateway {
  private io: SocketIOServer | null = null;
  private initialized = false;
  private pendingThreads = new Set<string>();
  private metricsTimer: NodeJS.Timeout | null = null;
  private readonly COALESCE_MS = 100;

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  /** Attach Socket.IO to the provided HTTP server. */
  init(params: { server: HTTPServer }): this {
    if (this.initialized) return this;
    const server = params.server;
    this.io = new SocketIOServer(server, { path: '/socket.io', transports: ['websocket'], cors: { origin: '*' } });
    this.io.on('connection', (socket: Socket) => {
      // Room subscription
      const SubscribeSchema = z
        .object({ rooms: z.array(z.string()).optional(), room: z.string().optional() })
        .strict();
      socket.on('subscribe', (payload: unknown) => {
        const parsed = SubscribeSchema.safeParse(payload);
        if (!parsed.success) {
          this.logger.error('Socket subscribe payload invalid', parsed.error.issues);
          return;
        }
        const p = parsed.data;
        const rooms: string[] = p.rooms ?? (p.room ? [p.room] : []);
        for (const r of rooms) if (r.length > 0) socket.join(r);
      });
      socket.on('error', (e: unknown) => {
        this.logger.error('Socket error', e);
      });
    });
    this.initialized = true;
    // Wire runtime status events to socket broadcast
    this.attachRuntimeSubscriptions();
    this.logger.info('GraphSocketGateway initialized and attached at /socket.io');
    return this;
  }

  private broadcast<T>(event: 'node_status' | 'node_state' | 'node_reminder_count', payload: T, schema: z.ZodType<T>) {
    if (!this.io) return;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error('Gateway payload validation failed', parsed.error.issues);
      return;
    }
    this.io.emit(event, parsed.data);
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
    if (!this.io) return;
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.io.to('threads').emit('thread_created', payload);
  }
  emitThreadUpdated(thread: { id: string; alias: string; summary: string | null; status: ThreadStatus; createdAt: Date; parentId?: string | null }) {
    if (!this.io) return;
    const payload = { thread: { ...thread, createdAt: thread.createdAt.toISOString() } };
    this.io.to('threads').emit('thread_updated', payload);
  }
  emitMessageCreated(threadId: string, message: { id: string; kind: MessageKind; text: string | null; source: import('type-fest').JsonValue | unknown; createdAt: Date; runId?: string }) {
    if (!this.io) return;
    const payload = { message: { ...message, createdAt: message.createdAt.toISOString() } };
    this.io.to(`thread:${threadId}`).emit('message_created', payload);
  }
  emitRunStatusChanged(threadId: string, run: { id: string; status: RunStatus; createdAt: Date; updatedAt: Date }) {
    if (!this.io) return;
    const payload = { run: { ...run, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() } };
    this.io.to(`thread:${threadId}`).emit('run_status_changed', payload);
  }
  private async computeThreadMetrics(threadId: string): Promise<{ remindersCount: number; activity: 'working' | 'waiting' | 'idle' } | null> {
    try {
      const prisma = this.prismaService.getClient();
      type MetricsRow = { root_id: string; reminders_count: number; desc_working: boolean; self_working: boolean };
      const rows: MetricsRow[] = await prisma.$queryRaw`
        with sel as (
          select ${threadId}::uuid as root_id
        ), rec as (
          select t.id as thread_id, t."parentId" as parent_id, t.id as root_id
          from "Thread" t join sel s on t.id = s.root_id
          union all
          select c.id as thread_id, c."parentId" as parent_id, r.root_id
          from "Thread" c join rec r on c."parentId" = r.thread_id
        ), runs as (
          select r."threadId" as thread_id
          from "Run" r
          where r.status = 'running'
        ), active_reminders as (
          select rem."threadId" as thread_id
          from "Reminder" rem
          where rem."completedAt" is null
        ), agg as (
          select rec.root_id,
                 count(ar.thread_id) as reminders_count,
                 bool_or(runs.thread_id is not null) filter (where rec.thread_id != rec.root_id) as desc_working,
                 bool_or(runs.thread_id is not null) filter (where rec.thread_id = rec.root_id) as self_working
          from rec
          left join runs on runs.thread_id = rec.thread_id
          left join active_reminders ar on ar.thread_id = rec.thread_id
          group by rec.root_id
        )
        select root_id,
               reminders_count::int,
               desc_working,
               self_working
        from agg;
      `;
      const r = rows[0];
      if (!r) return null;
      const activity: 'working' | 'waiting' | 'idle' = r.self_working ? 'working' : (r.desc_working || r.reminders_count > 0) ? 'waiting' : 'idle';
      return { remindersCount: r.reminders_count, activity };
    } catch (e) {
      this.logger.error('computeThreadMetrics error', e);
      return null;
    }
  }
  private flushMetricsQueue = async () => {
    const ids = Array.from(this.pendingThreads);
    this.pendingThreads.clear();
    this.metricsTimer = null;
    for (const id of ids) {
      const m = await this.computeThreadMetrics(id);
      if (!m || !this.io) continue;
      this.io.to('threads').emit('thread_activity_changed', { threadId: id, activity: m.activity });
      this.io.to('threads').emit('thread_reminders_count', { threadId: id, remindersCount: m.remindersCount });
      this.io.to(`thread:${id}`).emit('thread_activity_changed', { threadId: id, activity: m.activity });
      this.io.to(`thread:${id}`).emit('thread_reminders_count', { threadId: id, remindersCount: m.remindersCount });
    }
  };
  scheduleThreadMetrics(threadId: string) {
    this.pendingThreads.add(threadId);
    if (!this.metricsTimer) this.metricsTimer = setTimeout(this.flushMetricsQueue, this.COALESCE_MS);
  }
  async scheduleThreadAndAncestorsMetrics(threadId: string) {
    try {
      const prisma = this.prismaService.getClient();
      const rows: Array<{ id: string; parentId: string | null }> = await prisma.$queryRaw`
        with rec as (
          select t.id, t."parentId" from "Thread" t where t.id = ${threadId}
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
}
