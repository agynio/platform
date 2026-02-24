import {
  Metadata,
  Server,
  ServerDuplexStream,
  ServerUnaryCall,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  CancelExecutionRequest,
  CancelExecutionResponseSchema,
  CancelExecutionResponse,
  EnvVar,
  ExecErrorSchema,
  ExecExitReason,
  ExecExitSchema,
  ExecOutputSchema,
  ExecRequest,
  ExecResponse,
  ExecResponseSchema,
  ExecStartedSchema,
  ReadyRequest,
  ReadyResponse,
  ReadyResponseSchema,
} from '@agyn/runner-proto';
import {
  RUNNER_SERVICE_CANCEL_EXEC_PATH,
  RUNNER_SERVICE_EXEC_PATH,
  RUNNER_SERVICE_READY_PATH,
  runnerServiceGrpcDefinition,
} from '@agyn/runner-proto/grpc.js';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { create } from '@bufbuild/protobuf';
import type { ContainerService, InteractiveExecSession, NonceCache } from '../..';
import { verifyAuthHeaders } from '../..';
import type { RunnerConfig } from '../config';

type ExecStream = ServerDuplexStream<ExecRequest, ExecResponse>;

export type RunnerGrpcOptions = {
  config: RunnerConfig;
  containers: ContainerService;
  nonceCache: NonceCache;
};

type ExecutionContext = {
  executionId: string;
  targetId: string;
  requestId: string;
  call: ExecStream;
  session: InteractiveExecSession;
  startedAt: Date;
  stdoutSeq: bigint;
  stderrSeq: bigint;
  exitTailBytes: number;
  killOnTimeout: boolean;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  finished: boolean;
  timers: {
    timeout?: NodeJS.Timeout;
    idle?: NodeJS.Timeout;
  };
  reason: ExecExitReason;
  killed: boolean;
  finish?: (reason: ExecExitReason, killed?: boolean) => Promise<void>;
};

const activeExecutions = new Map<string, ExecutionContext>();

const utf8Encoder = new TextEncoder();
const DEFAULT_EXIT_TAIL_BYTES = 64 * 1024;
const MAX_EXIT_TAIL_BYTES = 256 * 1024;
const CONTAINER_STOP_TIMEOUT_SEC = 10;

// TODO: Implement remaining RPCs (start, stop, logs, etc.) in subsequent steps.

function coerceDuration(value?: bigint): number | undefined {
  if (typeof value !== 'bigint') return undefined;
  if (value <= 0n) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function metadataToHeaders(metadata: Metadata): Record<string, string> {
  const raw = metadata.getMap();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    headers[key] = typeof value === 'string' ? value : value.toString('utf8');
  }
  return headers;
}

function createRunnerError(code: string, message: string, retryable: boolean) {
  return create(ExecErrorSchema, { code, message, retryable });
}

function toServiceError(code: status, message: string): ServiceError {
  const error = new Error(message) as ServiceError;
  error.code = code;
  error.details = message;
  error.metadata = new Metadata();
  return error;
}

function writeResponse(call: ExecStream, response: ExecResponse): void {
  try {
    call.write(response);
  } catch {
    // ignore stream write errors caused by ended clients
  }
}

function verifyGrpcAuth({
  metadata,
  secret,
  nonceCache,
  path,
}: {
  metadata: Metadata;
  secret: string;
  nonceCache: NonceCache;
  path: string;
}) {
  return verifyAuthHeaders({
    headers: metadataToHeaders(metadata),
    method: 'POST',
    path,
    body: '',
    secret,
    nonceCache,
  });
}

function utf8Tail(data: string, maxBytes: number): Uint8Array {
  if (maxBytes <= 0) return new Uint8Array();
  const encoded = utf8Encoder.encode(data);
  if (encoded.byteLength <= maxBytes) return encoded;
  return encoded.subarray(encoded.byteLength - maxBytes);
}

export function createRunnerGrpcServer(opts: RunnerGrpcOptions): Server {
  const server = new Server({
    'grpc.max_send_message_length': 32 * 1024 * 1024,
    'grpc.max_receive_message_length': 32 * 1024 * 1024,
  });

  server.addService(runnerServiceGrpcDefinition, {
    ready: async (
      call: ServerUnaryCall<ReadyRequest, ReadyResponse>,
      callback: (error: ServiceError | null, value?: ReadyResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_READY_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      try {
        await opts.containers.getDocker().ping();
      } catch (error) {
        return callback(
          toServiceError(status.UNAVAILABLE, error instanceof Error ? error.message : String(error)),
        );
      }
      callback(null, create(ReadyResponseSchema, { status: 'ready' }));
    },
    exec: (call: ExecStream) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_EXEC_PATH,
      });
      if (!verification.ok) {
        call.emit('error', toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
        return;
      }

      let ctx: ExecutionContext | undefined;

      const clearTimers = (target?: ExecutionContext) => {
        if (!target) return;
        if (target.timers.timeout) {
          clearTimeout(target.timers.timeout);
          target.timers.timeout = undefined;
        }
        if (target.timers.idle) {
          clearTimeout(target.timers.idle);
          target.timers.idle = undefined;
        }
      };

      const finish = async (target: ExecutionContext, reason: ExecExitReason, killed = false) => {
        if (!target || target.finished) return;
        target.finished = true;
        target.reason = reason;
        target.killed = killed;
        clearTimers(target);
        activeExecutions.delete(target.executionId);
        try {
          const result = await target.session.close();
          const stdoutTail = utf8Tail(result.stdout, target.exitTailBytes);
          const stderrTail = utf8Tail(result.stderr, target.exitTailBytes);
          const exitMessage = create(ExecExitSchema, {
            executionId: target.executionId,
            exitCode: result.exitCode,
            killed: target.killed,
            reason: target.reason,
            stdoutTail,
            stderrTail,
            finishedAt: timestampFromDate(new Date()),
          });
          writeResponse(target.call, create(ExecResponseSchema, { event: { case: 'exit', value: exitMessage } }));
        } catch (error) {
          writeResponse(
            target.call,
            create(ExecResponseSchema, {
              event: {
                case: 'error',
                value: createRunnerError(
                  'exec_close_failed',
                  error instanceof Error ? error.message : String(error),
                  false,
                ),
              },
            }),
          );
        } finally {
          target.call.end();
        }
      };

      call.on('data', async (req) => {
        if (!req?.msg?.case) return;
        if (req.msg.case === 'start') {
          if (ctx) {
            writeResponse(
              call,
              create(ExecResponseSchema, {
                event: {
                  case: 'error',
                  value: createRunnerError('exec_already_started', 'duplicate exec start received', false),
                },
              }),
            );
            return;
          }
          const start = req.msg.value;
          const command = start.commandArgv.length > 0 ? start.commandArgv : start.commandShell;
          if (!command || (Array.isArray(command) && command.length === 0)) {
            writeResponse(
              call,
              create(ExecResponseSchema, {
                event: { case: 'error', value: createRunnerError('invalid_command', 'command required', false) },
              }),
            );
            call.end();
            return;
          }
          const exitTailBytes = (() => {
            const requested = start.options?.exitTailBytes ? Number(start.options.exitTailBytes) : DEFAULT_EXIT_TAIL_BYTES;
            if (!Number.isFinite(requested) || requested <= 0) return 0;
            return Math.min(requested, MAX_EXIT_TAIL_BYTES);
          })();
          try {
            const session = await opts.containers.openInteractiveExec(start.targetId, command, {
              workdir: start.options?.workdir || undefined,
              env: start.options?.env?.length
                ? Object.fromEntries(start.options.env.map(({ name, value }: EnvVar) => [name, value]))
                : undefined,
              tty: start.options?.tty ?? false,
              demuxStderr: start.options?.separateStderr ?? true,
            });
            const timeoutMs = coerceDuration(start.options?.timeoutMs);
            const idleTimeoutMs = coerceDuration(start.options?.idleTimeoutMs);
            const now = new Date();
            const context: ExecutionContext = {
              executionId: session.execId,
              targetId: start.targetId,
              requestId: start.requestId,
              call,
              session,
              startedAt: now,
              stdoutSeq: 0n,
              stderrSeq: 0n,
              exitTailBytes,
              killOnTimeout: start.options?.killOnTimeout ?? false,
              timeoutMs,
              idleTimeoutMs,
              finished: false,
              timers: {},
              reason: ExecExitReason.COMPLETED,
              killed: false,
            };
            ctx = context;
            context.finish = (reason, killed) => finish(context, reason, killed);
            activeExecutions.set(context.executionId, context);

            const handleTimeout = async (target: ExecutionContext, reason: ExecExitReason) => {
              if (target.finished) return;
              target.reason = reason;
              target.killed = target.killOnTimeout;
              if (target.killOnTimeout) {
                try {
                  await opts.containers.stopContainer(target.targetId, CONTAINER_STOP_TIMEOUT_SEC);
                } catch (stopErr) {
                  console.warn('Failed to stop container on exec timeout', {
                    containerId: target.targetId,
                    error: stopErr instanceof Error ? stopErr.message : stopErr,
                    reason,
                  });
                }
              }
              try {
                await target.finish?.(reason, target.killOnTimeout);
              } catch {
                // finish already emits structured error; swallow here
              }
            };

            const armIdleTimer = () => {
              if (!context.idleTimeoutMs || context.idleTimeoutMs <= 0) return;
              if (context.finished) return;
              if (context.timers.idle) {
                clearTimeout(context.timers.idle);
              }
              context.timers.idle = setTimeout(() => {
                if (context.finished) return;
                void handleTimeout(context, ExecExitReason.IDLE_TIMEOUT);
              }, context.idleTimeoutMs);
            };

            if (context.timeoutMs && context.timeoutMs > 0) {
              context.timers.timeout = setTimeout(() => {
                if (context.finished) return;
                void handleTimeout(context, ExecExitReason.TIMEOUT);
              }, context.timeoutMs);
            }

            const started = create(ExecStartedSchema, {
              executionId: context.executionId,
              startedAt: timestampFromDate(now),
            });
            writeResponse(call, create(ExecResponseSchema, { event: { case: 'started', value: started } }));

            if (context.idleTimeoutMs && context.idleTimeoutMs > 0) {
              armIdleTimer();
            }

            session.stdout.on('data', (chunk: Buffer) => {
              if (!ctx || ctx.finished) return;
              ctx.stdoutSeq += 1n;
              const output = create(ExecOutputSchema, {
                seq: ctx.stdoutSeq,
                data: chunk,
                ts: timestampFromDate(new Date()),
              });
              writeResponse(call, create(ExecResponseSchema, { event: { case: 'stdout', value: output } }));
              armIdleTimer();
            });
            session.stderr?.on('data', (chunk: Buffer) => {
              if (!ctx || ctx.finished) return;
              ctx.stderrSeq += 1n;
              const output = create(ExecOutputSchema, {
                seq: ctx.stderrSeq,
                data: chunk,
                ts: timestampFromDate(new Date()),
              });
              writeResponse(call, create(ExecResponseSchema, { event: { case: 'stderr', value: output } }));
              armIdleTimer();
            });

            const finalize = () => {
              if (ctx) void finish(ctx, ctx.reason, ctx.killed);
            };

            session.stdout.once('end', finalize);
            session.stdout.once('close', finalize);
            session.stderr?.once('end', finalize);
            session.stderr?.once('close', finalize);
          } catch (error) {
            writeResponse(
              call,
              create(ExecResponseSchema, {
                event: {
                  case: 'error',
                  value: createRunnerError(
                    'exec_start_failed',
                    error instanceof Error ? error.message : String(error),
                    false,
                  ),
                },
              }),
            );
            call.end();
          }
          return;
        }

        if (!ctx) {
          writeResponse(
            call,
            create(ExecResponseSchema, {
              event: {
                case: 'error',
                value: createRunnerError('exec_not_started', 'exec start required before streaming', false),
              },
            }),
          );
          call.end();
          return;
        }

        const session = ctx.session;

        if (req.msg.case === 'stdin') {
          const stdin = req.msg.value;
          if (stdin.data && stdin.data.length > 0) {
            session.stdin.write(Buffer.from(stdin.data));
          }
          if (stdin.eof) {
            session.stdin.end();
          }
          return;
        }

        if (req.msg.case === 'resize') {
          try {
            await opts.containers.resizeExec(ctx.executionId, {
              cols: req.msg.value.cols,
              rows: req.msg.value.rows,
            });
          } catch (error) {
            writeResponse(
              call,
              create(ExecResponseSchema, {
                event: {
                  case: 'error',
                  value: createRunnerError(
                    'exec_resize_failed',
                    error instanceof Error ? error.message : String(error),
                    false,
                  ),
                },
              }),
            );
          }
        }
      });

      call.on('end', () => {
        if (ctx && !ctx.finished) {
          try {
            ctx.session.stdin.end();
          } catch {
            // ignore
          }
        }
      });

      call.on('error', () => {
        if (ctx) void finish(ctx, ExecExitReason.RUNNER_ERROR, ctx.killed);
      });

      call.on('close', () => {
        if (ctx) void finish(ctx, ExecExitReason.CANCELLED, ctx.killed);
      });
    },
    cancelExecution: async (
      call: ServerUnaryCall<CancelExecutionRequest, CancelExecutionResponse>,
      callback: (error: ServiceError | null, value?: CancelExecutionResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_CANCEL_EXEC_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const ctx = activeExecutions.get(call.request.executionId);
      if (!ctx) {
        return callback(null, create(CancelExecutionResponseSchema, { cancelled: false }));
      }
      ctx.finish?.(ExecExitReason.CANCELLED, call.request.force).catch(() => {
        // swallow cancellation finish errors; streaming response will carry failure if needed
      });
      callback(null, create(CancelExecutionResponseSchema, { cancelled: true }));
    },
  });

  return server;
}
