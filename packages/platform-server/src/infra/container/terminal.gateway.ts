import { Inject, Injectable } from '@nestjs/common';
import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { TerminalSessionsService, type TerminalSessionRecord } from './terminal.sessions.service';
import { ContainerService } from './container.service';
import { LoggerService } from '../../core/services/logger.service';

const QuerySchema = z
  .object({ sessionId: z.string().uuid(), token: z.string().min(1) })
  .strict();

const IncomingMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(8192) }),
  z.object({ type: z.literal('resize'), cols: z.number().int().min(20).max(400), rows: z.number().int().min(10).max(200) }),
  z.object({ type: z.literal('ping'), ts: z.number().int().optional() }),
  z.object({ type: z.literal('close') }),
]);

@Injectable()
export class ContainerTerminalGateway {
  private registered = false;

  constructor(
    @Inject(TerminalSessionsService) private readonly sessions: TerminalSessionsService,
    @Inject(ContainerService) private readonly containers: ContainerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  registerRoutes(fastify: FastifyInstance): void {
    if (this.registered) return;
    fastify.register(websocketPlugin);
    fastify.get('/api/containers/:containerId/terminal/ws', { websocket: true }, (socket, request) => {
      void this.handleConnection(socket, request);
    });
    this.registered = true;
    this.logger.info('Container terminal WebSocket registered');
  }

  private async handleConnection(socket: WebSocket, request: FastifyRequest): Promise<void> {
    const isOpen = () => socket.readyState === WebSocket.OPEN;
    const send = (payload: Record<string, unknown>) => {
      if (!isOpen()) return;
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        this.logger.warn('terminal socket send failed', { error: err instanceof Error ? err.message : String(err) });
      }
    };

    const params = request.params as { containerId?: string };
    const containerIdParam = params?.containerId;
    if (!containerIdParam) {
      send({ type: 'error', code: 'container_id_required', message: 'Container id missing in route' });
      socket.close(1008, 'container_id_required');
      return;
    }

    const parsedQuery = QuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      send({ type: 'error', code: 'invalid_query', message: 'Invalid session parameters' });
      socket.close(1008, 'invalid_query');
      return;
    }
    const { sessionId, token } = parsedQuery.data;

    let session: TerminalSessionRecord;
    try {
      session = this.sessions.validate(sessionId, token);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'session_error';
      send({ type: 'error', code, message: 'Terminal session validation failed' });
      socket.close(1008, code);
      return;
    }

    const containerId = session.containerId;
    if (containerIdParam && containerIdParam !== containerId) {
      send({ type: 'error', code: 'container_mismatch', message: 'Terminal session belongs to different container' });
      socket.close(1008, 'container_mismatch');
      return;
    }

    try {
      this.sessions.markConnected(sessionId);
      session = this.sessions.get(sessionId)!;
    } catch (err) {
      const code = err instanceof Error ? err.message : 'session_error';
      send({ type: 'error', code, message: 'Terminal session already connected' });
      socket.close(1008, code);
      return;
    }

    send({ type: 'status', phase: 'starting' });

    const refreshActivity = () => {
      this.sessions.touch(sessionId);
      resetIdleTimer();
    };

    const idleTimeoutMs = session.idleTimeoutMs;
    const maxDurationRemaining = Math.max(0, session.maxDurationMs - (Date.now() - session.createdAt));
    let idleTimer: NodeJS.Timeout | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (idleTimeoutMs > 0) {
        idleTimer = setTimeout(() => {
          send({ type: 'error', code: 'idle_timeout', message: 'Terminal session idle timeout exceeded' });
          void cleanup('idle_timeout');
        }, idleTimeoutMs);
        if (idleTimer.unref) idleTimer.unref();
      }
    };
    resetIdleTimer();

    const maxTimer = maxDurationRemaining
      ? setTimeout(() => {
          send({ type: 'error', code: 'max_duration', message: 'Terminal session maximum duration exceeded' });
          void cleanup('max_duration');
        }, maxDurationRemaining)
      : null;
    if (maxTimer?.unref) maxTimer.unref();

    let execId: string | null = null;
    let stdin: NodeJS.WritableStream | null = null;
    let stdout: NodeJS.ReadableStream | null = null;
    let stderr: NodeJS.ReadableStream | null = null;
    let closeExec: (() => Promise<{ exitCode: number }>) | null = null;
    let closed = false;

    const cleanup = async (reason: string) => {
      if (closed) return;
      closed = true;
      try {
        if (idleTimer) clearTimeout(idleTimer);
        if (maxTimer) clearTimeout(maxTimer);
      } catch {
        // ignore timer cleanup errors
      }
      try {
        stdin?.end?.();
      } catch {
        // ignore
      }
      stdout?.removeAllListeners?.('data');
      stdout?.removeAllListeners?.('end');
      stderr?.removeAllListeners?.('data');
      socket.removeAllListeners?.('message');
      socket.removeAllListeners?.('close');
      socket.removeAllListeners?.('error');
      try {
        if (closeExec) {
          const { exitCode } = await closeExec();
          send({ type: 'status', phase: 'exited', exitCode });
        }
      } catch (err) {
        send({ type: 'status', phase: 'error', reason: err instanceof Error ? err.message : String(err) });
      } finally {
        this.sessions.close(sessionId);
        try {
          if (isOpen()) socket.close(1000, reason);
        } catch {
          // ignore close errors
        }
      }
    };

    try {
      const exec = await this.containers.openInteractiveExec(containerId, `exec ${session.shell}`, {
        tty: true,
        demuxStderr: false,
      });
      execId = exec.execId;
      stdin = exec.stdin;
      stdout = exec.stdout;
      stderr = exec.stderr ?? null;
      closeExec = exec.close;
      send({ type: 'status', phase: 'running' });
      refreshActivity();

      if (execId) {
        try {
          await this.containers.resizeExec(execId, { cols: session.cols, rows: session.rows });
        } catch (err) {
          this.logger.warn('initial terminal resize failed', {
            execId,
            containerId: containerId.substring(0, 12),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      stdout?.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (data.length) send({ type: 'output', data });
        refreshActivity();
      });
      stdout?.on('end', () => {
        void cleanup('stream_end');
      });
      stderr?.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (data.length) send({ type: 'output', data });
        refreshActivity();
      });
    } catch (err) {
      send({ type: 'error', code: 'exec_start_failed', message: err instanceof Error ? err.message : String(err) });
      await cleanup('exec_start_failed');
      return;
    }

    socket.on('message', (raw: RawData) => {
      if (closed) return;
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        send({ type: 'error', code: 'invalid_json', message: 'Invalid JSON payload' });
        return;
      }
      const result = IncomingMessageSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'error', code: 'invalid_payload', message: 'Invalid terminal message payload' });
        return;
      }
      const message = result.data;
      switch (message.type) {
        case 'input': {
          if (!stdin) {
            send({ type: 'error', code: 'stdin_closed', message: 'Terminal stdin unavailable' });
            return;
          }
          try {
            stdin.write(message.data, () => refreshActivity());
          } catch (err) {
            send({ type: 'error', code: 'stdin_write_failed', message: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case 'resize': {
          if (!execId) return;
          this.sessions.touch(sessionId);
          resetIdleTimer();
          void this.containers.resizeExec(execId, { cols: message.cols, rows: message.rows }).catch((err) => {
            this.logger.warn('terminal resize failed', {
              execId,
              containerId: containerId.substring(0, 12),
              error: err instanceof Error ? err.message : String(err),
            });
            send({ type: 'error', code: 'resize_failed', message: 'Terminal resize failed' });
          });
          break;
        }
        case 'ping': {
          const ts = typeof message.ts === 'number' ? message.ts : Date.now();
          send({ type: 'pong', ts });
          refreshActivity();
          break;
        }
        case 'close': {
          void cleanup('client_closed');
          break;
        }
        default:
          break;
      }
    });

    socket.on('close', () => {
      void cleanup('socket_closed');
    });

    socket.on('error', (err) => {
      this.logger.warn('terminal socket error', {
        containerId: containerId.substring(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      void cleanup('socket_error');
    });
  }
}
