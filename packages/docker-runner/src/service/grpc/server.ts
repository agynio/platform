import { Code, ConnectError, type ConnectRouter, type HandlerContext } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { createServer as createHttp2Server, type Http2Server } from 'node:http2';
import {
  CancelExecutionResponseSchema,
  ExecErrorSchema,
  ExecExitReason,
  ExecExitSchema,
  ExecOutputSchema,
  ExecRequest,
  ExecResponse,
  ExecStartRequest,
  ExecResponseSchema,
  ExecStartedSchema,
  FindWorkloadsByLabelsResponseSchema,
  GetWorkloadLabelsResponseSchema,
  InspectWorkloadResponseSchema,
  ListWorkloadsByVolumeResponseSchema,
  LogChunkSchema,
  LogEndSchema,
  PutArchiveResponseSchema,
  ReadyResponseSchema,
  RemoveVolumeResponseSchema,
  RemoveWorkloadResponseSchema,
  RunnerError,
  RunnerErrorSchema,
  RunnerEventDataSchema,
  StartWorkloadResponseSchema,
  StopWorkloadResponseSchema,
  StreamEventsRequest,
  StreamEventsResponse,
  StreamEventsResponseSchema,
  StreamWorkloadLogsResponse,
  StreamWorkloadLogsResponseSchema,
  TargetMountSchema,
  TouchWorkloadResponseSchema,
  SidecarInstance,
  SidecarInstanceSchema,
  WorkloadContainersSchema,
  WorkloadStatus,
  RunnerService,
} from '../../proto/gen/agynio/api/runner/v1/runner_pb.js';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { create } from '@bufbuild/protobuf';
import type { ContainerService, InteractiveExecSession, LogsStreamSession, NonceCache } from '../..';
import type { ContainerHandle } from '../../lib/container.handle';
import { verifyAuthHeaders } from '../..';
import type { RunnerConfig } from '../config';
import { createDockerEventsParser } from '../dockerEvents.parser';
import { startWorkloadRequestToContainerOpts } from '../../contracts/workload.grpc';

export type RunnerGrpcOptions = {
  config: RunnerConfig;
  containers: ContainerService;
  nonceCache: NonceCache;
};

type ExecutionContext = {
  executionId: string;
  targetId: string;
  requestId: string;
  session: InteractiveExecSession;
  startedAt: Date;
  stdoutSeq: bigint;
  stderrSeq: bigint;
  exitTailBytes: number;
  killOnTimeout: boolean;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  finished: boolean;
  cancelRequested: boolean;
  timers: {
    timeout?: NodeJS.Timeout;
    idle?: NodeJS.Timeout;
    completion?: NodeJS.Timeout;
  };
  reason: ExecExitReason;
  killed: boolean;
  finish?: (reason: ExecExitReason, killed?: boolean) => Promise<void>;
};

const activeExecutions = new Map<string, ExecutionContext>();

const shouldDebugExec = process.env.DEBUG_RUNNER_EXEC === '1';

const logExec = (message: string, details: Record<string, unknown> = {}) => {
  if (!shouldDebugExec) return;
  console.info(`[runner exec] ${message}`, details);
};

const runnerServicePath = (method: keyof typeof RunnerService.method): string =>
  `/${RunnerService.typeName}/${RunnerService.method[method].name}`;

const createAsyncQueue = <T>() => {
  const queue: T[] = [];
  let resolve: (() => void) | undefined;
  let ended = false;

  const notify = () => {
    if (resolve) {
      resolve();
      resolve = undefined;
    }
  };

  const push = (value: T) => {
    if (ended) return;
    queue.push(value);
    notify();
  };

  const end = () => {
    if (ended) return;
    ended = true;
    notify();
  };

  const iterate = async function* () {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (ended) return;
      await new Promise<void>((resolveWait) => {
        resolve = resolveWait;
      });
    }
  };

  return { push, end, iterate };
};

const clearExecutionTimers = (ctx?: ExecutionContext) => {
  if (!ctx) return;
  if (ctx.timers.timeout) {
    clearTimeout(ctx.timers.timeout);
    ctx.timers.timeout = undefined;
  }
  if (ctx.timers.idle) {
    clearTimeout(ctx.timers.idle);
    ctx.timers.idle = undefined;
  }
  if (ctx.timers.completion) {
    clearTimeout(ctx.timers.completion);
    ctx.timers.completion = undefined;
  }
};

const utf8Encoder = new TextEncoder();
const DEFAULT_EXIT_TAIL_BYTES = 64 * 1024;
const MAX_EXIT_TAIL_BYTES = 256 * 1024;
const CONTAINER_STOP_TIMEOUT_SEC = 10;
const SIDECAR_ROLE_LABEL = 'hautech.ai/role';
const SIDECAR_ROLE_VALUE = 'sidecar';
const PARENT_CONTAINER_LABEL = 'hautech.ai/parent_cid';

async function findSidecarHandles(containers: ContainerService, workloadId: string): Promise<ContainerHandle[]> {
  try {
    return await containers.findContainersByLabels(
      {
        [SIDECAR_ROLE_LABEL]: SIDECAR_ROLE_VALUE,
        [PARENT_CONTAINER_LABEL]: workloadId,
      },
      { all: true },
    );
  } catch {
    return [];
  }
}

async function stopSidecars(containers: ContainerService, workloadId: string, timeoutSec: number): Promise<void> {
  const handles = await findSidecarHandles(containers, workloadId);
  for (const handle of handles) {
    try {
      await containers.stopContainer(handle.id, timeoutSec);
    } catch {
      // ignore sidecar stop failures
    }
  }
}

async function removeSidecars(
  containers: ContainerService,
  workloadId: string,
  options: { force?: boolean; removeVolumes?: boolean },
): Promise<void> {
  const handles = await findSidecarHandles(containers, workloadId);
  for (const handle of handles) {
    try {
      await containers.removeContainer(handle.id, options);
    } catch {
      // ignore sidecar removal failures
    }
  }
}

type DockerErrorDetails = {
  statusCode?: number;
  status?: number;
  reason?: string;
  statusMessage?: string;
  code?: string;
  message?: string;
  json?: { message?: string };
};

type ExtractedDockerError = {
  statusCode: number;
  code?: string;
  message?: string;
};

const normalizeCode = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || undefined;
};

const extractDockerError = (error: unknown): ExtractedDockerError | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as DockerErrorDetails;
  const statusCode = candidate.statusCode ?? candidate.status;
  if (typeof statusCode !== 'number') return null;
  const message = candidate.json?.message?.trim() ?? candidate.message?.trim() ?? candidate.reason?.trim() ?? candidate.statusMessage?.trim();
  const code = candidate.code ?? normalizeCode(candidate.reason ?? candidate.statusMessage);
  return { statusCode, code: code ?? undefined, message: message ?? undefined };
};

const mapStatusCodeToCode = (statusCode: number | undefined, fallback: Code): Code => {
  if (typeof statusCode !== 'number' || statusCode <= 0) return fallback;
  switch (statusCode) {
    case 400:
    case 422:
      return Code.InvalidArgument;
    case 401:
      return Code.Unauthenticated;
    case 403:
      return Code.PermissionDenied;
    case 404:
      return Code.NotFound;
    case 409:
      return Code.Aborted;
    case 412:
      return Code.FailedPrecondition;
    case 429:
      return Code.ResourceExhausted;
    case 499:
      return Code.Canceled;
    case 500:
      return Code.Internal;
    case 502:
    case 503:
    case 504:
      return Code.Unavailable;
    default:
      if (statusCode >= 500) return Code.Unavailable;
      return fallback;
  }
};

const errorMessageFromUnknown = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
};

const toDockerServiceError = (
  error: unknown,
  fallbackStatus: Code,
  fallbackMessage = 'runner_error',
): ConnectError => {
  const extracted = extractDockerError(error);
  const message = extracted?.message ?? errorMessageFromUnknown(error, fallbackMessage);
  const code = mapStatusCodeToCode(extracted?.statusCode, fallbackStatus);
  return new ConnectError(message, code);
};

const toRunnerStreamError = (
  error: unknown,
  defaultCode: string,
  fallbackMessage: string,
  fallbackRetryable = false,
): RunnerError => {
  const extracted = extractDockerError(error);
  const message = extracted?.message ?? errorMessageFromUnknown(error, fallbackMessage);
  const retryable = extracted ? extracted.statusCode >= 500 : fallbackRetryable;
  const code = extracted?.code ?? defaultCode;
  return create(RunnerErrorSchema, {
    code,
    message,
    details: {},
    retryable,
  });
};

const bigintToNumber = (value?: bigint): number | undefined => {
  if (typeof value !== 'bigint') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const buildEventFilters = (filters: StreamEventsRequest['filters']): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const filter of filters ?? []) {
    const key = filter?.key?.trim();
    if (!key) continue;
    const values = (filter.values ?? [])
      .map((value: string | undefined) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string): value is string => value.length > 0);
    if (!values.length) continue;
    result[key] = result[key] ? [...result[key], ...values] : values;
  }
  return result;
};

const safeQueuePush = <T>(queue: { push: (message: T) => void }, message: T): void => {
  try {
    queue.push(message);
  } catch {
    // ignore downstream cancellation errors
  }
};

function coerceDuration(value?: bigint): number | undefined {
  if (typeof value !== 'bigint') return undefined;
  if (value <= 0n) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

function createRunnerError(code: string, message: string, retryable: boolean) {
  return create(ExecErrorSchema, { code, message, retryable });
}

function toServiceError(code: Code, message: string): ConnectError {
  return new ConnectError(message, code);
}

function verifyConnectAuth({
  header,
  secret,
  nonceCache,
  path,
}: {
  header: Headers;
  secret: string;
  nonceCache: NonceCache;
  path: string;
}) {
  return verifyAuthHeaders({
    headers: headersToRecord(header),
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

export function createRunnerGrpcServer(opts: RunnerGrpcOptions): Http2Server {
  const requireAuth = (context: HandlerContext, method: keyof typeof RunnerService.method) => {
    const verification = verifyConnectAuth({
      header: context.requestHeader,
      secret: opts.config.sharedSecret,
      nonceCache: opts.nonceCache,
      path: runnerServicePath(method),
    });
    if (!verification.ok) {
      throw toServiceError(Code.Unauthenticated, verification.message ?? 'unauthorized');
    }
  };

  const routes = (router: ConnectRouter) =>
    router.service(RunnerService, {
    ready: async (_request, context) => {
      requireAuth(context, 'ready');
      try {
        await opts.containers.getDocker().ping();
      } catch (error) {
        throw toServiceError(Code.Unavailable, error instanceof Error ? error.message : String(error));
      }
      return create(ReadyResponseSchema, { status: 'ready' });
    },
    startWorkload: async (request, context) => {
      requireAuth(context, 'startWorkload');
      if (!request?.main) {
        throw toServiceError(Code.InvalidArgument, 'main_container_required');
      }
      try {
        const containerOpts = startWorkloadRequestToContainerOpts(request);
        const sidecarOpts = Array.isArray(containerOpts.sidecars) ? containerOpts.sidecars : [];
        const stopAndRemove = async (containerId: string) => {
          try {
            await opts.containers.stopContainer(containerId, CONTAINER_STOP_TIMEOUT_SEC);
          } catch {
            // ignore stop errors during rollback
          }
          try {
            await opts.containers.removeContainer(containerId, { force: true, removeVolumes: true });
          } catch {
            // ignore removal errors during rollback
          }
        };

        const mainHandle = await opts.containers.start(containerOpts);

        const startedSidecars: ContainerHandle[] = [];
        const sidecarInstances: SidecarInstance[] = [];

        const describeSidecar = async (
          containerId: string,
          fallbackName: string,
        ): Promise<{ name: string; status: string }> => {
          try {
            const inspect = await opts.containers.inspectContainer(containerId);
            const rawName = typeof inspect.Name === 'string' ? inspect.Name.replace(/^\/+/, '') : '';
            const name = rawName || fallbackName;
            const statusLabel = inspect.State?.Status ? String(inspect.State.Status) : 'running';
            return { name, status: statusLabel };
          } catch {
            return { name: fallbackName, status: 'running' };
          }
        };

        try {
          for (let index = 0; index < sidecarOpts.length; index += 1) {
            const sidecar = sidecarOpts[index];
            const labels = {
              ...(sidecar.labels ?? {}),
              [SIDECAR_ROLE_LABEL]: SIDECAR_ROLE_VALUE,
              [PARENT_CONTAINER_LABEL]: mainHandle.id,
            };
            const networkMode =
              sidecar.networkMode === 'container:main'
                ? `container:${mainHandle.id}`
                : sidecar.networkMode;

            const sidecarHandle = await opts.containers.start({
              image: sidecar.image,
              cmd: sidecar.cmd,
              env: sidecar.env,
              autoRemove: sidecar.autoRemove,
              anonymousVolumes: sidecar.anonymousVolumes,
              privileged: sidecar.privileged,
              createExtras: sidecar.createExtras,
              networkMode,
              labels,
            });
            startedSidecars.push(sidecarHandle);

            const fallbackName = `sidecar-${index + 1}`;
            const { name: reportedName, status: reportedStatus } = await describeSidecar(
              sidecarHandle.id,
              fallbackName,
            );

            sidecarInstances.push(
              create(SidecarInstanceSchema, {
                name: reportedName,
                id: sidecarHandle.id,
                status: reportedStatus,
              }),
            );
          }
        } catch (error) {
          for (const sidecarHandle of startedSidecars.reverse()) {
            await stopAndRemove(sidecarHandle.id);
          }
          await stopAndRemove(mainHandle.id);
          throw error;
        }

        return create(StartWorkloadResponseSchema, {
          id: mainHandle.id,
          containers: create(WorkloadContainersSchema, { main: mainHandle.id, sidecars: sidecarInstances }),
          status: WorkloadStatus.RUNNING,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'main_container_spec_required') {
          throw toServiceError(Code.InvalidArgument, error.message);
        }
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    stopWorkload: async (request, context) => {
      requireAuth(context, 'stopWorkload');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }
      const timeoutSec =
        typeof request.timeoutSec === 'number' && request.timeoutSec >= 0
          ? request.timeoutSec
          : CONTAINER_STOP_TIMEOUT_SEC;
      try {
        await stopSidecars(opts.containers, workloadId, timeoutSec);
        await opts.containers.stopContainer(workloadId, timeoutSec);
        return create(StopWorkloadResponseSchema, {});
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    removeWorkload: async (request, context) => {
      requireAuth(context, 'removeWorkload');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }
      try {
        await removeSidecars(opts.containers, workloadId, {
          force: request.force ?? false,
          removeVolumes: request.removeVolumes ?? false,
        });
        await opts.containers.removeContainer(workloadId, {
          force: request.force ?? false,
          removeVolumes: request.removeVolumes ?? false,
        });
        return create(RemoveWorkloadResponseSchema, {});
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    inspectWorkload: async (request, context) => {
      requireAuth(context, 'inspectWorkload');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }
      try {
        const details = await opts.containers.inspectContainer(workloadId);
        const mounts = (details.Mounts ?? []).map((mount: {
          Type?: string | null;
          Source?: string | null;
          Destination?: string | null;
          ReadOnly?: boolean;
          RW?: boolean;
        }) =>
          create(TargetMountSchema, {
            type: mount.Type ?? '',
            source: mount.Source ?? '',
            destination: mount.Destination ?? '',
            readOnly: mount.ReadOnly === true || mount.RW === false,
          }),
        );
        return create(InspectWorkloadResponseSchema, {
          id: details.Id ?? '',
          name: details.Name ?? '',
          image: details.Image ?? '',
          configImage: details.Config?.Image ?? '',
          configLabels: details.Config?.Labels ?? {},
          mounts,
          stateStatus: details.State?.Status ?? '',
          stateRunning: details.State?.Running === true,
        });
      } catch (error) {
        throw toDockerServiceError(error, Code.NotFound);
      }
    },
    getWorkloadLabels: async (request, context) => {
      requireAuth(context, 'getWorkloadLabels');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }
      try {
        const labels = await opts.containers.getContainerLabels(workloadId);
        return create(GetWorkloadLabelsResponseSchema, { labels: labels ?? {} });
      } catch (error) {
        throw toDockerServiceError(error, Code.NotFound);
      }
    },
    findWorkloadsByLabels: async (request, context) => {
      requireAuth(context, 'findWorkloadsByLabels');
      const labels = request.labels ?? {};
      if (!labels || Object.keys(labels).length === 0) {
        throw toServiceError(Code.InvalidArgument, 'labels_required');
      }
      try {
        const containers = await opts.containers.findContainersByLabels(labels, { all: request.all ?? false });
        return create(FindWorkloadsByLabelsResponseSchema, {
          targetIds: containers.map((handle: ContainerHandle) => handle.id),
        });
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    listWorkloadsByVolume: async (request, context) => {
      requireAuth(context, 'listWorkloadsByVolume');
      const volumeName = request.volumeName?.trim();
      if (!volumeName) {
        throw toServiceError(Code.InvalidArgument, 'volume_name_required');
      }
      try {
        const ids = await opts.containers.listContainersByVolume(volumeName);
        return create(ListWorkloadsByVolumeResponseSchema, { targetIds: ids });
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    removeVolume: async (request, context) => {
      requireAuth(context, 'removeVolume');
      const volumeName = request.volumeName?.trim();
      if (!volumeName) {
        throw toServiceError(Code.InvalidArgument, 'volume_name_required');
      }
      try {
        await opts.containers.removeVolume(volumeName, { force: request.force ?? false });
        return create(RemoveVolumeResponseSchema, {});
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    touchWorkload: async (request, context) => {
      requireAuth(context, 'touchWorkload');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }
      try {
        await opts.containers.touchLastUsed(workloadId);
        return create(TouchWorkloadResponseSchema, {});
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    putArchive: async (request, context) => {
      requireAuth(context, 'putArchive');
      const workloadId = request.workloadId?.trim();
      const targetPath = request.path?.trim();
      if (!workloadId || !targetPath) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_and_path_required');
      }
      try {
        await opts.containers.putArchive(workloadId, Buffer.from(request.tarPayload ?? new Uint8Array()), {
          path: targetPath,
        });
        return create(PutArchiveResponseSchema, {});
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }
    },
    streamWorkloadLogs: async function* (request, context) {
      requireAuth(context, 'streamWorkloadLogs');
      const workloadId = request.workloadId?.trim();
      if (!workloadId) {
        throw toServiceError(Code.InvalidArgument, 'workload_id_required');
      }

      const follow = request.follow !== false;
      const since = bigintToNumber(request.since);
      const tail = typeof request.tail === 'number' && request.tail > 0 ? request.tail : undefined;
      const stdout = request.stdout;
      const stderr = request.stderr;
      const timestamps = request.timestamps;

      let session: LogsStreamSession;
      try {
        session = await opts.containers.streamContainerLogs(workloadId, {
          follow,
          since,
          tail,
          stdout,
          stderr,
          timestamps,
        });
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }

      const { stream } = session;
      const queue = createAsyncQueue<StreamWorkloadLogsResponse>();
      let closed = false;

      const normalizeChunk = (chunk: unknown): Buffer => {
        if (Buffer.isBuffer(chunk)) return chunk;
        if (chunk instanceof Uint8Array) return Buffer.from(chunk);
        if (typeof chunk === 'string') return Buffer.from(chunk);
        return Buffer.from([]);
      };

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        stream.removeListener('data', onData);
        stream.removeListener('error', onError);
        stream.removeListener('end', onEnd);
        context.signal.removeEventListener('abort', onAbort);
        try {
          await session.close();
        } catch {
          // ignore cleanup errors
        }
        queue.end();
      };

      const onData = (chunk: unknown) => {
        const buffer = normalizeChunk(chunk);
        safeQueuePush(
          queue,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'chunk', value: create(LogChunkSchema, { data: buffer }) },
          }),
        );
      };

      const onError = (error: unknown) => {
        safeQueuePush(
          queue,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'error', value: toRunnerStreamError(error, 'logs_stream_error', 'log stream failed') },
          }),
        );
        void cleanup();
      };

      const onEnd = () => {
        safeQueuePush(
          queue,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'end', value: create(LogEndSchema, {}) },
          }),
        );
        void cleanup();
      };

      const onAbort = () => {
        void cleanup();
      };

      stream.on('data', onData);
      stream.on('error', onError);
      stream.on('end', onEnd);
      context.signal.addEventListener('abort', onAbort, { once: true });

      try {
        for await (const message of queue.iterate()) {
          yield message;
        }
      } finally {
        await cleanup();
      }
    },
    streamEvents: async function* (request, context) {
      requireAuth(context, 'streamEvents');

      const since = bigintToNumber(request.since);
      const filters = buildEventFilters(request.filters ?? []);

      let eventsStream: NodeJS.ReadableStream;
      try {
        eventsStream = await opts.containers.getEventsStream({
          since,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
      } catch (error) {
        throw toDockerServiceError(error, Code.Unknown);
      }

      const queue = createAsyncQueue<StreamEventsResponse>();
      let closed = false;

      const parser = createDockerEventsParser(
        (event: Record<string, unknown>) => {
          safeQueuePush(
            queue,
            create(StreamEventsResponseSchema, {
              event: {
                case: 'data',
                value: create(RunnerEventDataSchema, { json: JSON.stringify(event) }),
              },
            }),
          );
        },
        {
          onError: (payload: string, error: unknown) => {
            safeQueuePush(
              queue,
              create(StreamEventsResponseSchema, {
                event: {
                  case: 'error',
                  value: toRunnerStreamError(
                    error ?? new Error('events_parse_error'),
                    'events_parse_error',
                    `failed to parse docker event: ${payload}`,
                  ),
                },
              }),
            );
          },
        },
      );

      const cleanup = () => {
        if (closed) return;
        closed = true;
        eventsStream.removeListener('data', onData);
        eventsStream.removeListener('error', onError);
        eventsStream.removeListener('end', onEnd);
        context.signal.removeEventListener('abort', onAbort);
        const destroy = (eventsStream as NodeJS.ReadableStream & { destroy?: (error?: Error) => void }).destroy;
        if (typeof destroy === 'function') {
          destroy.call(eventsStream);
        }
        queue.end();
      };

      const onData = (chunk: unknown) => {
        parser.handleChunk(chunk as Buffer);
      };

      const onError = (error: unknown) => {
        safeQueuePush(
          queue,
          create(StreamEventsResponseSchema, {
            event: { case: 'error', value: toRunnerStreamError(error, 'events_stream_error', 'event stream failed') },
          }),
        );
        cleanup();
      };

      const onEnd = () => {
        parser.flush();
        cleanup();
      };

      const onAbort = () => {
        cleanup();
      };

      eventsStream.on('data', onData);
      eventsStream.on('error', onError);
      eventsStream.on('end', onEnd);
      context.signal.addEventListener('abort', onAbort, { once: true });

      try {
        for await (const message of queue.iterate()) {
          yield message;
        }
      } finally {
        cleanup();
      }
    },
    exec: async function* (requests, context) {
      requireAuth(context, 'exec');

      const responseQueue = createAsyncQueue<ExecResponse>();
      let ctx: ExecutionContext | undefined;
      let closed = false;

      const closeResponses = () => {
        if (closed) return;
        logExec('closeResponses', {
          executionId: ctx?.executionId,
          requestId: ctx?.requestId,
          finished: ctx?.finished,
        });
        closed = true;
        responseQueue.end();
      };

      const writeResponse = (response: ExecResponse) => {
        safeQueuePush(responseQueue, response);
      };

      const finish = async (target: ExecutionContext, reason: ExecExitReason, killed = false) => {
        if (!target || target.finished) return;
        logExec('finish', {
          executionId: target.executionId,
          requestId: target.requestId,
          reason,
          killed,
        });
        target.finished = true;
        target.reason = reason;
        target.killed = killed;
        clearExecutionTimers(target);
        activeExecutions.delete(target.executionId);
        try {
          const result = await target.session.close();
          let computedExit = typeof result.exitCode === 'number' ? result.exitCode : -1;
          if (reason === ExecExitReason.CANCELLED && (!Number.isFinite(computedExit) || computedExit < 0)) {
            computedExit = 0;
          }
          const stdoutTail = utf8Tail(result.stdout, target.exitTailBytes);
          const stderrTail = utf8Tail(result.stderr, target.exitTailBytes);
          const exitMessage = create(ExecExitSchema, {
            executionId: target.executionId,
            exitCode: computedExit,
            killed: target.killed,
            reason: target.reason,
            stdoutTail,
            stderrTail,
            finishedAt: timestampFromDate(new Date()),
          });
          writeResponse(create(ExecResponseSchema, { event: { case: 'exit', value: exitMessage } }));
        } catch (error) {
          writeResponse(
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
          closeResponses();
        }
      };

      const handleTimeout = async (target: ExecutionContext, reason: ExecExitReason) => {
        if (target.finished || target.cancelRequested) return;
        target.reason = reason;
        const terminationReason = reason === ExecExitReason.IDLE_TIMEOUT ? 'idle_timeout' : 'timeout';
        try {
          await target.session.terminateProcessGroup(terminationReason);
          target.killed = true;
        } catch (terminateErr) {
          target.killed = false;
          console.warn('Failed to terminate exec process group on timeout', {
            executionId: target.executionId,
            containerId: target.targetId,
            reason,
            error: terminateErr instanceof Error ? terminateErr.message : terminateErr,
          });
        }
        try {
          await target.finish?.(reason, target.killed);
        } catch {
          // finish already emits structured error; swallow here
        }
      };

      const handleStart = async (start: ExecStartRequest) => {
        if (ctx) {
          writeResponse(
            create(ExecResponseSchema, {
              event: {
                case: 'error',
                value: createRunnerError('exec_already_started', 'duplicate exec start received', false),
              },
            }),
          );
          return;
        }
        const command = start.commandArgv.length > 0 ? start.commandArgv : start.commandShell;
        if (!command || (Array.isArray(command) && command.length === 0)) {
          writeResponse(
            create(ExecResponseSchema, {
              event: { case: 'error', value: createRunnerError('invalid_command', 'command required', false) },
            }),
          );
          closeResponses();
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
              ? Object.fromEntries(
                  start.options.env.map(({ name, value }: { name: string; value: string }) => [name, value] as [
                    string,
                    string,
                  ]),
                )
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
            session,
            startedAt: now,
            stdoutSeq: 0n,
            stderrSeq: 0n,
            exitTailBytes,
            killOnTimeout: start.options?.killOnTimeout ?? false,
            timeoutMs,
            idleTimeoutMs,
            finished: false,
            cancelRequested: false,
            timers: {},
            reason: ExecExitReason.COMPLETED,
            killed: false,
          };
          ctx = context;
          context.finish = (reason: ExecExitReason, killed?: boolean) => finish(context, reason, killed);
          activeExecutions.set(context.executionId, context);

          const armIdleTimer = () => {
            if (!context.idleTimeoutMs || context.idleTimeoutMs <= 0) return;
            if (context.finished || context.cancelRequested) return;
            if (context.timers.idle) {
              clearTimeout(context.timers.idle);
            }
            context.timers.idle = setTimeout(() => {
              if (context.finished || context.cancelRequested) return;
              void handleTimeout(context, ExecExitReason.IDLE_TIMEOUT);
            }, context.idleTimeoutMs);
          };

          let completionInFlight = false;
          const armCompletionCheck = () => {
            if (context.finished || context.cancelRequested) return;
            if (context.timers.completion) return;
            context.timers.completion = setInterval(() => {
              if (context.finished || context.cancelRequested || completionInFlight) return;
              completionInFlight = true;
              void (async () => {
                try {
                  const details = await context.session.inspect();
                  if (!details?.Running) {
                    await finish(context, context.reason, context.killed);
                  }
                } catch (error) {
                  console.warn('Failed to inspect exec status', {
                    executionId: context.executionId,
                    containerId: context.targetId,
                    error: error instanceof Error ? error.message : error,
                  });
                  await finish(context, ExecExitReason.RUNNER_ERROR, context.killed);
                } finally {
                  completionInFlight = false;
                }
              })();
            }, 1000);
          };

          if (context.timeoutMs && context.timeoutMs > 0) {
            context.timers.timeout = setTimeout(() => {
              if (context.finished || context.cancelRequested) return;
              void handleTimeout(context, ExecExitReason.TIMEOUT);
            }, context.timeoutMs);
          }
          const started = create(ExecStartedSchema, {
            executionId: context.executionId,
            startedAt: timestampFromDate(now),
          });
          writeResponse(create(ExecResponseSchema, { event: { case: 'started', value: started } }));

          if (context.idleTimeoutMs && context.idleTimeoutMs > 0) {
            armIdleTimer();
          }
          armCompletionCheck();
          session.stdout.on('data', (chunk: Buffer) => {
            if (!ctx || ctx.finished) return;
            ctx.stdoutSeq += 1n;
            const output = create(ExecOutputSchema, {
              seq: ctx.stdoutSeq,
              data: chunk,
              ts: timestampFromDate(new Date()),
            });
            writeResponse(create(ExecResponseSchema, { event: { case: 'stdout', value: output } }));
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
            writeResponse(create(ExecResponseSchema, { event: { case: 'stderr', value: output } }));
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
          closeResponses();
        }
      };

      const handleRequest = async (req: ExecRequest) => {
        if (!req?.msg?.case) return;
        if (req.msg.case === 'start') {
          await handleStart(req.msg.value);
          return;
        }

        if (!ctx) {
          writeResponse(
            create(ExecResponseSchema, {
              event: {
                case: 'error',
                value: createRunnerError('exec_not_started', 'exec start required before streaming', false),
              },
            }),
          );
          closeResponses();
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
      };

      const handleRequests = (async () => {
        try {
          for await (const req of requests) {
            if (closed) break;
            await handleRequest(req);
            if (closed || ctx?.finished) break;
          }
          logExec('handleRequests completed', {
            executionId: ctx?.executionId,
            requestId: ctx?.requestId,
            finished: ctx?.finished,
            closed,
          });
          if (!ctx || closed) {
            closeResponses();
            return;
          }
          if (ctx.finished) {
            return;
          }
          return;
        } catch {
          logExec('handleRequests error', {
            executionId: ctx?.executionId,
            requestId: ctx?.requestId,
            finished: ctx?.finished,
            closed,
          });
          if (!ctx || closed) {
            closeResponses();
            return;
          }
          if (ctx.finished) {
            return;
          }
          clearExecutionTimers(ctx);
          await finish(ctx, ExecExitReason.RUNNER_ERROR, ctx.killed);
        }
      })();

      const onAbort = () => {
        logExec('context aborted', {
          executionId: ctx?.executionId,
          requestId: ctx?.requestId,
          finished: ctx?.finished,
          closed,
        });
        if (!ctx || ctx.finished || closed) return;
        ctx.cancelRequested = true;
        clearExecutionTimers(ctx);
        void finish(ctx, ExecExitReason.CANCELLED, ctx.killed);
      };
      context.signal.addEventListener('abort', onAbort, { once: true });

      try {
        for await (const response of responseQueue.iterate()) {
          yield response;
        }
      } finally {
        logExec('response loop closing', {
          executionId: ctx?.executionId,
          requestId: ctx?.requestId,
          finished: ctx?.finished,
          closed,
        });
        context.signal.removeEventListener('abort', onAbort);
        closeResponses();
        await handleRequests.catch(() => undefined);
      }
    },
    cancelExecution: async (request, context) => {
      requireAuth(context, 'cancelExecution');
      const ctx = activeExecutions.get(request.executionId);
      if (!ctx) {
        return create(CancelExecutionResponseSchema, { cancelled: false });
      }
      ctx.cancelRequested = true;
      clearExecutionTimers(ctx);
      if (ctx.finished) {
        return create(CancelExecutionResponseSchema, { cancelled: true });
      }
      ctx.finish?.(ExecExitReason.CANCELLED, request.force).catch(() => {
        // finish already emits structured error; swallow here
      });
      return create(CancelExecutionResponseSchema, { cancelled: true });
    },
    });

  return createHttp2Server(connectNodeAdapter({ routes }));
}
