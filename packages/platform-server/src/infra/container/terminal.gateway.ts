import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import { TerminalSessionsService, type TerminalSessionRecord } from './terminal.sessions.service';
import { WorkspaceProvider } from '../../workspace/providers/workspace.provider';
import { WorkspaceHandle } from '../../workspace/workspace.handle';
import type { WorkspaceExecResult } from '../../workspace/runtime/workspace.runtime.provider';

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

const safeSend = (candidate: unknown, payload: Record<string, unknown>, logger: Logger): void => {
  if (!isWsLike(candidate)) {
    return;
  }
  if (candidate.readyState !== READY_STATE_OPEN) {
    return;
  }
  try {
    candidate.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn('terminal socket send failed', { error: err instanceof Error ? err.message : String(err) });
  }
};

const safeClose = (candidate: unknown, code: number | undefined, reason: string | undefined, logger: Logger): void => {
  if (!isWsLike(candidate)) {
    return;
  }
  const ws = candidate;
  const details = { code, reason };
  if (typeof ws.close === 'function') {
    try {
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
      end.call(ws);
      return;
    } catch (err) {
      logger.warn('terminal socket close via end() failed', {
        ...details,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
  private readonly logger = new Logger(ContainerTerminalGateway.name);
  constructor(
    @Inject(TerminalSessionsService) private readonly sessions: TerminalSessionsService,
    @Inject(WorkspaceProvider) private readonly workspaceProvider: WorkspaceProvider,
  ) {}

  private wss: WebSocketServer | null = null;

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

      const workspaceId = match[1] ?? match[2] ?? '';
      const wss = this.wss;
      if (!wss) return;

      socket.on('error', (err) => {
        this.logger.warn('Terminal WS upgrade socket error', {
          path: parsedUrl.pathname,
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      wss.handleUpgrade(req, socket, head, (ws) => {
        const stream: SocketStream = { socket: ws };
        const fakeReq = {
          params: { workspaceId },
          query: Object.fromEntries(parsedUrl.searchParams.entries()),
        } as unknown as FastifyRequest;
        void this.handleConnection(stream, fakeReq);
      });
    });
    this.registered = true;
  }

  private async handleConnection(connection: SocketStream, request: FastifyRequest): Promise<void> {
    const rawSocket = (connection as { socket?: unknown }).socket;
    const candidate = (rawSocket ?? connection) as unknown;
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
    const isOpen = () => ws.readyState === READY_STATE_OPEN;
    const send = (payload: Record<string, unknown>) => {
      if (!isOpen()) {
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
    let workspaceId: string | null = null;
    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
    let execId: string | null = null;
    let sessionMarkedConnected = false;
    let started = false;
    let closedEarly = false;
    let stdin: NodeJS.WritableStream | null = null;
    let stdout: NodeJS.ReadableStream | null = null;
    let stderr: NodeJS.ReadableStream | null = null;
    let closeExec: (() => Promise<WorkspaceExecResult>) | null = null;
    let closed = false;
    let onMessage: ((raw: RawDataLike) => void) | null = null;
    let onClose: (() => void) | null = null;
    let onError: ((err: Error) => void) | null = null;
    let workspaceHandle: WorkspaceHandle | null = null;

    const params = request.params as { workspaceId?: string };
    const workspaceIdParam = params?.workspaceId;
    if (!workspaceIdParam) {
      send({ type: 'error', code: 'workspace_id_required', message: 'Workspace id missing in route' });
      close(1008, 'workspace_id_required');
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
      const context = {
        sessionId: session?.sessionId ?? sessionId ?? 'unknown',
        workspaceId: workspaceId ?? workspaceIdParam ?? 'unknown',
        phase,
        ...extra,
      };
      if (phase === 'running') {
        this.logger.log('Terminal session started', context);
      } else if (phase === 'exited') {
        this.logger.log('Terminal session exited', context);
      } else if (phase === 'error') {
        this.logger.warn('Terminal session errored', context);
      }
    };

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
            this.logger.warn('terminal session touch on early close failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
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
      const workspacePrefix = String(workspaceId ?? workspaceIdParam ?? '').slice(0, 12);
      this.logger.warn('terminal socket error', {
        workspaceId: workspacePrefix,
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
      try {
        if (idleTimer) clearTimeout(idleTimer);
        if (maxTimer) clearTimeout(maxTimer);
      } catch {
        // ignore timer cleanup errors
      }
      try {
        if (stdin) {
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
            this.logger.warn('terminal session touch during cleanup failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          try {
            this.sessions.close(sessionId);
          } catch (err) {
            this.logger.warn('terminal session close during cleanup failed', {
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
        return false;
      }
      if (!isOpen()) {
        return false;
      }
      try {
        this.sessions.markConnected(sessionId);
        session = this.sessions.get(sessionId) ?? session;
        sessionMarkedConnected = true;
        return true;
      } catch (err) {
        const code = err instanceof Error ? err.message : 'session_error';
        this.logger.warn('Terminal session markConnected failed after exec start', {
          sessionId,
          workspaceId,
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
        workspaceId: workspaceIdParam ?? 'unknown',
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

    workspaceId = session.workspaceId;
    workspaceHandle = new WorkspaceHandle(this.workspaceProvider, workspaceId);
    const workspaceShortId = workspaceId.substring(0, 12);

    if (workspaceIdParam && workspaceIdParam !== workspaceId) {
      send({ type: 'error', code: 'workspace_mismatch', message: 'Terminal session belongs to different workspace' });
      close(1008, 'workspace_mismatch');
      await cleanup('workspace_mismatch');
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
      const handle = workspaceHandle;
      if (!handle) throw new Error('workspace_handle_unavailable');
      const exec = await handle.openInteractiveExec(`exec ${session.shell}`, {
        tty: true,
        demuxStderr: false,
      });
      execId = exec.execId;
      stdin = exec.stdin;
      stdout = exec.stdout;
      stderr = exec.stderr ?? null;
      closeExec = exec.close;
      if (stdin && typeof (stdin as NodeJS.WriteStream).setDefaultEncoding === 'function') {
        (stdin as NodeJS.WriteStream).setDefaultEncoding('utf8');
      }
      if (stdin) {
        stdin.on('error', (err) => {
          this.logger.warn('terminal stdin error', {
            execId,
            sessionId,
            workspaceId: workspaceShortId,
            error: err instanceof Error ? err.message : String(err),
          });
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
          await handle.resizeExec(execId, { cols: session.cols, rows: session.rows });
        } catch (err) {
          this.logger.warn('initial terminal resize failed', {
            execId,
            sessionId,
            workspaceId: workspaceShortId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (stdout) {
        stdout.on('error', (err) => {
          this.logger.warn('terminal stdout error', {
            execId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      let stdoutMuxRemainder: Buffer | null = null;
      let stdoutMuxStrippedLogged = false;
      const decodeDockerMultiplex = (
        buffer: Buffer,
        hadPending: boolean,
      ): {
        payloads: Buffer[];
        remainder: Buffer | null;
        stripped: boolean;
        treatAsPlain: boolean;
      } => {
        let offset = 0;
        const frames: Buffer[] = [];
        let stripped = false;

        while (buffer.length - offset >= 8) {
          const streamId = buffer[offset];
          const headerLooksValid =
            (streamId === 0 || streamId === 1 || streamId === 2) &&
            buffer[offset + 1] === 0 &&
            buffer[offset + 2] === 0 &&
            buffer[offset + 3] === 0;

          if (!headerLooksValid) {
            if (frames.length === 0) {
              return { payloads: [buffer], remainder: null, stripped: false, treatAsPlain: true };
            }
            frames.push(buffer.subarray(offset));
            return { payloads: frames, remainder: null, stripped: true, treatAsPlain: false };
          }

          const frameLength = buffer.readUInt32BE(offset + 4);
          const frameEnd = offset + 8 + frameLength;
          if (frameEnd > buffer.length) {
            return { payloads: frames, remainder: buffer.subarray(offset), stripped, treatAsPlain: false };
          }

          frames.push(buffer.subarray(offset + 8, frameEnd));
          stripped = true;
          offset = frameEnd;
        }

        if (frames.length === 0 && !stripped) {
          if (hadPending) {
            return { payloads: [], remainder: buffer, stripped: false, treatAsPlain: false };
          }
          return { payloads: [buffer], remainder: null, stripped: false, treatAsPlain: true };
        }

        if (offset < buffer.length) {
          return { payloads: frames, remainder: buffer.subarray(offset), stripped, treatAsPlain: false };
        }

        return { payloads: frames, remainder: null, stripped, treatAsPlain: false };
      };

      stdout?.on('data', (chunk: Buffer | string) => {
        if (!chunk) return;
        const incoming = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        const combined = stdoutMuxRemainder ? Buffer.concat([stdoutMuxRemainder, incoming]) : incoming;
        const potentialHeaderByte = combined.length > 0 ? combined[0] : undefined;
        if (!stdoutMuxRemainder && combined.length > 0 && combined.length < 8) {
          if (potentialHeaderByte === 0 || potentialHeaderByte === 1 || potentialHeaderByte === 2) {
            stdoutMuxRemainder = combined;
            refreshActivity();
            return;
          }
        }
        const hadPending = stdoutMuxRemainder !== null;
        const { payloads, remainder, stripped, treatAsPlain } = decodeDockerMultiplex(combined, hadPending);
        stdoutMuxRemainder = remainder;
        if (stripped && !stdoutMuxStrippedLogged) {
          stdoutMuxStrippedLogged = true;
          this.logger.warn('docker multiplex headers stripped from stdout', {
            execId,
            sessionId,
            workspaceId: workspaceShortId,
          });
        }

        if (!payloads.length) {
          refreshActivity();
          return;
        }

        const payloadBuffer = treatAsPlain ? payloads[0] : Buffer.concat(payloads);
        const data = payloadBuffer.toString('utf8');
        if (data.length) send({ type: 'output', data });
        refreshActivity();
      });
      stdout?.on('end', () => {
        void cleanup('stream_end');
      });
      if (stderr) {
        stderr.on('error', (err) => {
          this.logger.warn('terminal stderr error', {
            execId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      stderr?.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (data.length) send({ type: 'output', data });
        refreshActivity();
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
      switch (message.type) {
        case 'input': {
          if (!stdin) {
            this.logger.warn('terminal stdin unavailable on input', {
              execId,
              sessionId,
              workspaceId: workspaceShortId,
            });
            send({ type: 'error', code: 'stdin_closed', message: 'Terminal stdin unavailable' });
            return;
          }
          try {
            const normalized = message.data.replace(/\r\n/g, '\n').replace(/\n/g, '\r');
            const buffer = Buffer.from(normalized, 'utf8');
            const writeOk = stdin.write(buffer, (error) => {
              if (error) {
                this.logger.warn('terminal stdin write callback error', {
                  execId,
                  sessionId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
              refreshActivity();
            });
            if (!writeOk) {
              const streamRef = stdin;
              const onDrain = () => {
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
          const handleRef = workspaceHandle;
          if (!handleRef) return;
          this.sessions.touch(sessionId);
          resetIdleTimer();
          void handleRef
            .resizeExec(execId, { cols: message.cols, rows: message.rows })
            .catch((err) => {
              this.logger.warn('terminal resize failed', {
                execId,
                workspaceId: workspaceShortId,
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
          void cleanup('client_closed');
          break;
        }
        default:
          break;
      }
    };

  }
}
