import { Inject, Injectable, Scope } from '@nestjs/common';
import type { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from '../graph/liveGraph.manager';
import type Node from '../nodes/base/Node';

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
      .partial()
      .optional(),
    isPaused: z.boolean().optional(),
    dynamicConfigReady: z.boolean().optional(),
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

/**
 * Socket.IO gateway attached to Fastify/Nest HTTP server for graph events.
 * Constructors DI-only; call init({ server }) explicitly from bootstrap.
 */
@Injectable({ scope: Scope.DEFAULT })
export class GraphSocketGateway {
  private io: SocketIOServer | null = null;
  private initialized = false;

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {}

  /** Attach Socket.IO to the provided HTTP server. */
  init(params: { server: HTTPServer }): this {
    if (this.initialized) return this;
    const server = params.server;
    this.io = new SocketIOServer(server, { path: '/socket.io', transports: ['websocket'], cors: { origin: '*' } });
    this.io.on('connection', (socket: Socket) => {
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

  private broadcast<T>(event: 'node_status' | 'node_state', payload: T, schema: z.ZodType<T>) {
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
}
