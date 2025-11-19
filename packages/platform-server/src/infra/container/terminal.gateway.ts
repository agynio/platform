import { Inject, Injectable } from '@nestjs/common';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import { TerminalSessionsService, type TerminalSessionRecord } from './terminal.sessions.service';
import { ContainerService } from './container.service';
import { LoggerService } from '../../core/services/logger.service';

const QuerySchema = z
  .object({ sessionId: z.string().uuid(), token: z.string().min(1) })
  .strict();

const TERMINAL_PATH_REGEX = /^\/api\/containers\/(?:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})|([0-9a-fA-F]{64}))\/terminal\/ws$/;

const IncomingMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(8192) }),
  z.object({ type: z.literal('resize'), cols: z.number().int().min(20).max(400), rows: z.number().int().min(10).max(200) }),
  z.object({ type: z.literal('ping'), ts: z.number().int().optional() }),
  z.object({ type: z.literal('close') }),
]);

type SocketStream = { socket?: WebSocket };

type WsLike = {
  readyState: number;
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  close?: (code?: number, reason?: string) => void;
  terminate?: () => void;
  end?: () => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeAllListeners?: (event?: string) => unknown;
};

const READY_STATE_OPEN = 1; // WebSocket.OPEN
const EARLY_CLOSE_DETECTION_MS = 5;
type RawDataLike = RawData | string;

const getObjectKeys = (value: unknown): string[] | undefined => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    return Object.keys(value as { [key: string]: unknown });
  } catch {
    return undefined;
  }
};

const isWsLike = (value: unknown): value is WsLike => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WsLike>;
  return typeof candidate.readyState === 'number' && typeof candidate.send === 'function' && typeof candidate.on === 'function';
};

const safeSend = (candidate: unknown, payload: Record<string, unknown>, logger: LoggerService): void => {
  if (!isWsLike(candidate)) {
    logger.debug('terminal socket send skipped: socket not ws-like', { payloadType: payload.type });
    return;
  }
  if (candidate.readyState !== READY_STATE_OPEN) {
    logger.debug('terminal socket send skipped: socket not open', { payloadType: payload.type });
    return;
  }
  try {
    logger.debug('terminal socket send', { payload });
    candidate.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn('terminal socket send failed', { error: err instanceof Error ? err.message : String(err) });
  }
};

const safeClose = (candidate: unknown, code: number | undefined, reason: string | undefined, logger: LoggerService): void => {
  if (!isWsLike(candidate)) {
    logger.debug('terminal socket close skipped: socket not ws-like', { code, reason });
    return;
  }
  const ws = candidate;
  const details = { code, reason };
  if (typeof ws.close === 'function') {
    try {
      logger.debug('terminal socket close via close()', details);
      ws.close(code, reason);
      return;
    } catch (err) {
      logger.warn('terminal socket close via close() failed', {
        ...details,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (typeof ws.terminate === 'function') {
    try {
      logger.debug('terminal socket close via terminate()', details);
      ws.terminate();
      return;
    } catch (err) {
      logger.warn('terminal socket close via terminate() failed', {
        ...details,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const end = (ws as { end?: () => void }).end;
  if (typeof end === 'function') {
    try {
      logger.debug('terminal socket close via end()', details);
      end.call(ws);
      return;
    } catch (err) {
      logger.warn('terminal socket close via end() failed', {
        ...details,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.debug('terminal socket close fallback exhausted', details);
};

const isRawDataLike = (value: unknown): value is RawDataLike => {
  if (typeof value === 'string') return true;
  if (Buffer.isBuffer(value)) return true;
  if (Array.isArray(value)) {
    return value.every((chunk) => Buffer.isBuffer(chunk));
  }
  if (value instanceof ArrayBuffer) return true;
  return false;
};

const rawDataToUtf8 = (raw: RawDataLike): string => {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return '';
};

@Injectable()
export class ContainerTerminalGateway {
  private registered = false;
  private wss: WebSocketServer | null = null;

  constructor(
    @Inject(TerminalSessionsService) private readonly sessions: TerminalSessionsService,
    @Inject(ContainerService) private readonly containers: ContainerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  registerRoutes(fastify: FastifyInstance): void {
    if (this.registered) return;
    this.wss = new WebSocketServer({ noServer: true });

    fastify.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const rawUrl = req.url ?? '';
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl, 'http://localhost');
      } catch {
        return;
      }

      const match = TERMINAL_PATH_REGEX.exec(parsedUrl.pathname);
      if (!match) return;

      const containerId = match[1] ?? match[2] ?? '';
      const wss = this.wss;
      if (!wss) return;

      this.logger.info('Terminal WS upgrade handled', {
        path: parsedUrl.pathname,
        containerId,
        query: this.sanitizeUrlSearchParams(parsedUrl.searchParams),
        headers: this.sanitizeHeaders(req.headers),
      });

      socket.on('error', (err) => {
        this.logger.warn('Terminal WS upgrade socket error', {
          path: parsedUrl.pathname,
          containerId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      wss.handleUpgrade(req, socket, head, (ws) => {
        const stream: SocketStream = { socket: ws };
        const fakeReq = {
          params: { containerId },
          query: Object.fromEntries(parsedUrl.searchParams.entries()),
        } as unknown as FastifyRequest;
        void this.handleConnection(stream, fakeReq);
      });
    });
    this.registered = true;
    this.logger.info('Container terminal WebSocket upgrade handler registered');
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

  private sanitizeUrlSearchParams(params: URLSearchParams): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      sanitized[key] = key.toLowerCase() === 'token' ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  private sanitizeRequestQuery(query: unknown): Record<string, unknown> {
    if (!query || typeof query !== 'object') return {};
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      sanitized[key] = key && key.toLowerCase() === 'token' ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  private async handleConnection(connection: SocketStream, request: FastifyRequest): Promise<void> {
    const rawSocket = (connection as { socket?: unknown }).socket;
    if (process.env.NODE_ENV === 'test') {
      this.logger.debug('terminal connection shape', {
        connectionType: typeof connection,
        connectionKeys: getObjectKeys(connection),
        socketType: typeof rawSocket,
        socketKeys: getObjectKeys(rawSocket),
      });
    }
    const candidate = (rawSocket ?? connection) as unknown;
    const rawQuery = (request as { query?: unknown }).query;
    const containerIdParamFromReq = (request.params as { containerId?: string })?.containerId;
    this.logger.info('Terminal connection received', {
      containerIdParam: containerIdParamFromReq,
      query: this.sanitizeRequestQuery(rawQuery),
    });
    if (!isWsLike(candidate)) {
      this.logger.error('terminal websocket connection lacks ws-like interface', {
        connectionType: typeof connection,
        connectionKeys: getObjectKeys(connection),
      });
      try {
        (connection as { end?: () => void }).end?.();
      } catch {
        // ignore
      }
      try {
        (connection as { destroy?: () => void }).destroy?.();
      } catch {
        // ignore
      }
      try {
        (connection as { terminate?: () => void }).terminate?.();
      } catch {
        // ignore
      }
      return;
    }

    const ws: WsLike = candidate;
    const path = `/api/containers/${containerIdParamFromReq ?? 'unknown'}/terminal/ws`;
    const isOpen = () => ws.readyState === READY_STATE_OPEN;
    const send = (payload: Record<string, unknown>) => {
      if (!isOpen()) {
        this.logger.debug('terminal socket send skipped: socket closed', {
          sessionId,
          containerId: containerIdParam ?? 'unknown',
          payloadType: payload.type,
        });
        return;
      }
      safeSend(ws, payload, this.logger);
    };
    const close = (code: number, reason: string) => safeClose(ws, code, reason, this.logger);
    const detach = (event: string, handler?: (...args: unknown[]) => void) => {
      const off = (ws as { off?: (event: string, handler: (...args: unknown[]) => void) => void }).off;
      if (handler && typeof off === 'function') {
        off.call(ws, event, handler);
        return;
      }
      if (handler && typeof ws.removeListener === 'function') {
        ws.removeListener(event, handler);
        return;
      }
      if (typeof ws.removeAllListeners === 'function') {
        ws.removeAllListeners(event);
      }
    };

    let sessionId: string | null = null;
    let session: TerminalSessionRecord | null = null;
    let containerId: string | null = null;
    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
    let execId: string | null = null;
    let sessionMarkedConnected = false;
    let started = false;
    let closedEarly = false;
    let stdin: NodeJS.WritableStream | null = null;
    let stdout: NodeJS.ReadableStream | null = null;
    let stderr: NodeJS.ReadableStream | null = null;
    let closeExec: (() => Promise<{ exitCode: number }>) | null = null;
    let closed = false;
    let onMessage: ((raw: RawDataLike) => void) | null = null;
    let onClose: (() => void) | null = null;
    let onError: ((err: Error) => void) | null = null;

    const params = request.params as { containerId?: string };
    const containerIdParam = params?.containerId;
    if (!containerIdParam) {
      send({ type: 'error', code: 'container_id_required', message: 'Container id missing in route' });
      close(1008, 'container_id_required');
      return;
    }

    const parsedQuery = QuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      send({ type: 'error', code: 'invalid_query', message: 'Invalid session parameters' });
      close(1008, 'invalid_query');
      return;
    }
    sessionId = parsedQuery.data.sessionId;
    const token = parsedQuery.data.token;

    const logStatus = (phase: string, extra: Record<string, unknown> = {}) => {
      this.logger.info('Terminal session status emitted', {
        sessionId: session?.sessionId ?? sessionId ?? 'unknown',
        containerId: containerId ?? containerIdParam ?? 'unknown',
        phase,
        ...extra,
      });
    };

    this.logger.info('Terminal socket listeners attaching', {
      path,
      containerIdParam,
      sessionId,
      readyState: ws.readyState,
    });

    const messageListener = (...args: unknown[]) => {
      const [first] = args;
      if (!isRawDataLike(first)) {
        this.logger.warn('terminal socket message ignored: unsupported payload type', {
          payloadType: typeof first,
        });
        return;
      }
      if (onMessage) onMessage(first);
    };

    const closeListener = (..._args: unknown[]) => {
      if (!started && !closedEarly) {
        closedEarly = true;
        if (sessionId) {
          try {
            this.sessions.touch(sessionId);
          } catch (err) {
            this.logger.debug('terminal session touch on early close failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        this.logger.info('Terminal socket closed before session start, preserving for reconnect', {
          sessionId,
          containerId: containerIdParam ?? 'unknown',
          readyState: ws.readyState,
        });
        void cleanup('socket_closed', {
          preserveSession: true,
          skipStatus: true,
          skipCloseSocket: true,
        });
        return;
      }
      if (onClose) onClose();
    };

    onError = (err) => {
      const containerPrefix = String(containerId ?? containerIdParam ?? '').slice(0, 12);
      this.logger.warn('terminal socket error', {
        containerId: containerPrefix,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      void cleanup('socket_error');
    };

    const errorListener = (...args: unknown[]) => {
      const err = args[0] instanceof Error ? (args[0] as Error) : new Error(String(args[0] ?? 'unknown websocket error'));
      if (onError) onError(err);
    };

    type CleanupOptions = {
      preserveSession?: boolean;
      skipStatus?: boolean;
      skipCloseSocket?: boolean;
    };

    const cleanup = async (reason: string, options: CleanupOptions = {}) => {
      if (closed) return;
      closed = true;
      const { preserveSession = false, skipStatus = false, skipCloseSocket = false } = options;
      if (!sessionMarkedConnected && !execId && (preserveSession || reason.startsWith('socket_not_open_before_'))) {
        closedEarly = true;
      }
      this.logger.info('Terminal cleanup triggered', {
        execId,
        sessionId,
        reason,
        preserveSession,
      });
      try {
        if (idleTimer) clearTimeout(idleTimer);
        if (maxTimer) clearTimeout(maxTimer);
      } catch {
        // ignore timer cleanup errors
      }
      try {
        if (stdin) {
          this.logger.debug('terminal stdin end invoked', { execId, sessionId, reason });
          stdin.removeAllListeners?.('drain');
          stdin.end?.();
          stdin = null;
        }
      } catch {
        // ignore
      }
      stdout?.removeAllListeners?.('data');
      stdout?.removeAllListeners?.('end');
      stdout?.removeAllListeners?.('error');
      stdout?.removeAllListeners?.('close');
      stderr?.removeAllListeners?.('data');
      stderr?.removeAllListeners?.('end');
      stderr?.removeAllListeners?.('error');
      stderr?.removeAllListeners?.('close');
      stdout = null;
      stderr = null;
      detach('message', messageListener);
      detach('close', closeListener);
      detach('error', errorListener);
      onMessage = null;
      onClose = null;
      onError = null;

      let exitCodeResult: number | null = null;
      let exitError: string | null = null;
      if (closeExec) {
        try {
          const { exitCode } = await closeExec();
          exitCodeResult = exitCode;
        } catch (err) {
          exitError = err instanceof Error ? err.message : String(err);
        }
      }

      if (!skipStatus) {
        if (exitError) {
          send({ type: 'status', phase: 'error', reason: exitError });
          logStatus('error', { reason: exitError });
        } else if (exitCodeResult !== null) {
          send({ type: 'status', phase: 'exited', exitCode: exitCodeResult });
          logStatus('exited', { exitCode: exitCodeResult });
        }
      }

      if (sessionId) {
        const shouldPreserve = preserveSession || (!sessionMarkedConnected && !execId);
        if (shouldPreserve) {
          try {
            this.sessions.touch(sessionId);
          } catch (err) {
            this.logger.debug('terminal session touch during cleanup failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          this.logger.info('Terminal session retained for reconnect', {
            sessionId,
            execId,
            reason,
          });
        } else {
          try {
            this.sessions.close(sessionId);
            this.logger.info('Terminal session closed after exec', {
              sessionId,
              execId,
              reason,
            });
          } catch (err) {
            this.logger.debug('terminal session close during cleanup failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      if (skipCloseSocket) return;
      try {
        if (isOpen()) close(1000, reason);
      } catch {
        // ignore close errors
      }
    };

    onClose = () => {
      this.logger.info('Terminal socket close received', { execId, sessionId });
      void cleanup('socket_closed');
    };

    ws.on('message', messageListener);
    ws.on('close', closeListener);
    ws.on('error', errorListener);

    const waitForEarlyClose = async (): Promise<boolean> => {
      if (closed || !isOpen()) return true;
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const tempCloseListener = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          detach('close', tempCloseListener);
          resolve(true);
        };
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          detach('close', tempCloseListener);
          resolve(closed || !isOpen());
        }, EARLY_CLOSE_DETECTION_MS);
        ws.on('close', tempCloseListener);
      });
    };

    const abortIfSocketClosed = async (
      context: string,
      options: { wait?: boolean } = {},
    ): Promise<boolean> => {
      const { wait = true } = options;
      const alreadyClosed = closed || !isOpen();
      const aborted = alreadyClosed ? true : wait ? await waitForEarlyClose() : !isOpen();
      if (!aborted) return false;
      const reasonTag = `socket_not_open_before_${context}`;
      const preserve = !sessionMarkedConnected && !execId;
      if (preserve) closedEarly = true;
      this.logger.info('Terminal connection aborted before exec', {
        sessionId,
        containerIdParam,
        readyState: ws.readyState,
        context,
        preserve,
      });
      if (!closed) {
        await cleanup(reasonTag, {
          preserveSession: preserve,
          skipStatus: true,
          skipCloseSocket: true,
        });
      }
      return true;
    };

    const markSessionConnected = async (): Promise<boolean> => {
      if (!sessionId || sessionMarkedConnected) return true;
      if (closedEarly) {
        this.logger.info('Terminal session markConnected skipped: socket closed early', {
          sessionId,
          containerId: containerId ?? containerIdParam ?? 'unknown',
          execId,
        });
        return false;
      }
      if (!isOpen()) {
        this.logger.info('Terminal session markConnected skipped: socket not open', {
          sessionId,
          containerId: containerId ?? containerIdParam ?? 'unknown',
          execId,
        });
        return false;
      }
      try {
        this.sessions.markConnected(sessionId);
        session = this.sessions.get(sessionId) ?? session;
        sessionMarkedConnected = true;
        this.logger.info('Terminal session marked connected after exec start', {
          sessionId,
          containerId,
          execId,
        });
        return true;
      } catch (err) {
        const code = err instanceof Error ? err.message : 'session_error';
        this.logger.warn('Terminal session markConnected failed after exec start', {
          sessionId,
          containerId,
          execId,
          error: code,
        });
        send({ type: 'error', code, message: 'Terminal session already connected' });
        await cleanup('session_already_connected');
        return false;
      }
    };

    if (await abortIfSocketClosed('pre_validation')) {
      return;
    }

    if (started) {
      this.logger.warn('Terminal session start already handled, ignoring duplicate invocation', {
        sessionId,
        containerId: containerIdParam ?? 'unknown',
      });
      return;
    }
    started = true;

    try {
      session = this.sessions.validate(sessionId, token);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'session_error';
      send({ type: 'error', code, message: 'Terminal session validation failed' });
      close(1008, code);
      await cleanup('session_validation_failed');
      return;
    }

    containerId = session.containerId;

    this.logger.info('Terminal session validated', {
      sessionId,
      containerId,
    });
    this.logger.info('Terminal session markConnected deferred until exec start', {
      sessionId,
      containerId,
    });
    if (containerIdParam && containerIdParam !== containerId) {
      send({ type: 'error', code: 'container_mismatch', message: 'Terminal session belongs to different container' });
      close(1008, 'container_mismatch');
      await cleanup('container_mismatch');
      return;
    }

    send({ type: 'status', phase: 'starting' });
    logStatus('starting');

    if (await abortIfSocketClosed('pre_exec', { wait: false })) {
      return;
    }

    const refreshActivity = () => {
      this.sessions.touch(sessionId);
      resetIdleTimer();
    };

    const idleTimeoutMs = session.idleTimeoutMs;
    const maxDurationRemaining = Math.max(0, session.maxDurationMs - (Date.now() - session.createdAt));
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

    maxTimer = maxDurationRemaining
      ? setTimeout(() => {
          send({ type: 'error', code: 'max_duration', message: 'Terminal session maximum duration exceeded' });
          void cleanup('max_duration');
        }, maxDurationRemaining)
      : null;
    if (maxTimer?.unref) maxTimer.unref();

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
      this.logger.debug('terminal exec opened', {
        sessionId,
        containerId: containerId.substring(0, 12),
        execId,
        hasStdin: Boolean(stdin),
        hasStdout: Boolean(stdout),
        hasStderr: Boolean(stderr),
      });
      if (stdin && typeof (stdin as NodeJS.WriteStream).setDefaultEncoding === 'function') {
        (stdin as NodeJS.WriteStream).setDefaultEncoding('utf8');
        this.logger.debug('terminal stdin default encoding set', { execId, sessionId, encoding: 'utf8' });
      }
      if (stdin) {
        stdin.on('error', (err) => {
          this.logger.warn('terminal stdin error', {
            execId,
            sessionId,
            containerId: containerId.substring(0, 12),
            error: err instanceof Error ? err.message : String(err),
          });
        });
        stdin.on('close', () => {
          this.logger.debug('terminal stdin close', { execId, sessionId });
        });
        stdin.on('end', () => {
          this.logger.debug('terminal stdin end', { execId, sessionId });
        });
        stdin.on('finish', () => {
          this.logger.debug('terminal stdin finish', { execId, sessionId });
        });
      }
      if (await abortIfSocketClosed('post_exec_start', { wait: false })) {
        return;
      }

      if (!(await markSessionConnected())) {
        return;
      }

      send({ type: 'status', phase: 'running' });
      logStatus('running', { execId });
      refreshActivity();

      if (execId) {
        try {
          await this.containers.resizeExec(execId, { cols: session.cols, rows: session.rows });
          this.logger.debug('terminal resize applied', {
            execId,
            sessionId,
            cols: session.cols,
            rows: session.rows,
          });
        } catch (err) {
          this.logger.warn('initial terminal resize failed', {
            execId,
            sessionId,
            containerId: containerId.substring(0, 12),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let firstStdout = true;
      if (stdout) {
        this.logger.debug('terminal stdout stream attached', { execId, sessionId });
        stdout.on('error', (err) => {
          this.logger.warn('terminal stdout error', {
            execId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        stdout.on('close', () => {
          this.logger.debug('terminal stdout close', { execId, sessionId });
        });
      }
      stdout?.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (firstStdout) {
          firstStdout = false;
          this.logger.debug('terminal first stdout chunk', {
            execId,
            sessionId,
            length: data.length,
            preview: data.slice(0, 32),
          });
        }
        if (data.length) {
          this.logger.debug('terminal stdout chunk', {
            execId,
            sessionId,
            length: data.length,
            preview: data.slice(0, 32),
          });
        }
        if (data.length) send({ type: 'output', data });
        refreshActivity();
      });
      stdout?.on('end', () => {
        this.logger.debug('terminal stdout end', { execId, sessionId });
        void cleanup('stream_end');
      });
      if (stderr) {
        this.logger.debug('terminal stderr stream attached', { execId, sessionId });
        stderr.on('error', (err) => {
          this.logger.warn('terminal stderr error', {
            execId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        stderr.on('close', () => {
          this.logger.debug('terminal stderr close', { execId, sessionId });
        });
      }
      stderr?.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (data.length) {
          this.logger.debug('terminal stderr chunk', {
            execId,
            sessionId,
            length: data.length,
            preview: data.slice(0, 32),
          });
        }
        if (data.length) send({ type: 'output', data });
        refreshActivity();
      });
      stderr?.on('end', () => {
        this.logger.debug('terminal stderr end', { execId, sessionId });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: 'error', code: 'exec_start_failed', message });
      logStatus('error', { reason: message, code: 'exec_start_failed' });
      await cleanup('exec_start_failed');
      return;
    }

    onMessage = (raw: RawDataLike) => {
      if (closed) return;
      const text = rawDataToUtf8(raw);
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
      if (message.type === 'input') {
        const preview = message.data.slice(0, 16);
        this.logger.debug('terminal input message parsed', {
          type: message.type,
          sessionId,
          containerId: containerId.substring(0, 12),
          execId,
          length: message.data.length,
          preview,
        });
      }
      switch (message.type) {
        case 'input': {
          this.logger.info('Terminal socket message received', {
            sessionId,
            containerId: containerId.substring(0, 12),
            execId,
            type: message.type,
            length: message.data.length,
          });
          if (!stdin) {
            this.logger.warn('terminal stdin unavailable on input', {
              execId,
              sessionId,
              containerId: containerId.substring(0, 12),
            });
            send({ type: 'error', code: 'stdin_closed', message: 'Terminal stdin unavailable' });
            return;
          }
          try {
            const normalized = message.data.replace(/\r\n/g, '\n').replace(/\n/g, '\r');
            const buffer = Buffer.from(normalized, 'utf8');
            this.logger.debug('terminal stdin write start', {
              execId,
              sessionId,
              inputLength: message.data.length,
              bufferLength: buffer.byteLength,
              stdinWritable:
                typeof (stdin as NodeJS.WriteStream).writable === 'boolean'
                  ? (stdin as NodeJS.WriteStream).writable
                  : undefined,
            });
            const writeOk = stdin.write(buffer, (error) => {
              if (error) {
                this.logger.warn('terminal stdin write callback error', {
                  execId,
                  sessionId,
                  error: error instanceof Error ? error.message : String(error),
                });
              } else {
                this.logger.debug('terminal stdin write complete', {
                  execId,
                  sessionId,
                  bytes: buffer.byteLength,
                });
              }
              refreshActivity();
            });
            this.logger.debug('terminal stdin write dispatched', {
              execId,
              sessionId,
              ok: writeOk,
            });
            if (!writeOk) {
              const streamRef = stdin;
              const onDrain = () => {
                this.logger.debug('terminal stdin drain', { execId, sessionId });
                streamRef?.removeListener('drain', onDrain);
              };
              streamRef?.once('drain', onDrain);
            }
          } catch (err) {
            send({ type: 'error', code: 'stdin_write_failed', message: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case 'resize': {
          if (!execId) return;
          this.logger.info('Terminal socket message received', {
            sessionId,
            containerId: containerId.substring(0, 12),
            execId,
            type: message.type,
            cols: message.cols,
            rows: message.rows,
          });
          this.logger.debug('terminal resize message received', {
            execId,
            sessionId,
            cols: message.cols,
            rows: message.rows,
          });
          this.sessions.touch(sessionId);
          resetIdleTimer();
          void this.containers
            .resizeExec(execId, { cols: message.cols, rows: message.rows })
            .then(() => {
              this.logger.debug('terminal resize handled', {
                execId,
                sessionId,
                cols: message.cols,
                rows: message.rows,
              });
            })
            .catch((err) => {
              this.logger.warn('terminal resize failed', {
                execId,
                containerId: containerId.substring(0, 12),
                sessionId,
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
          this.logger.info('Terminal socket message received', {
            sessionId,
            containerId: containerId.substring(0, 12),
            execId,
            type: message.type,
          });
          this.logger.debug('terminal close message received', { execId, sessionId });
          void cleanup('client_closed');
          break;
        }
        default:
          break;
      }
    };

  }
}
