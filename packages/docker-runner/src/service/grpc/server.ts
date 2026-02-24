import {
  Metadata,
  Server,
  ServerDuplexStream,
  ServerUnaryCall,
  ServerWritableStream,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  CancelExecutionRequest,
  CancelExecutionResponse,
  CancelExecutionResponseSchema,
  ExecErrorSchema,
  ExecExitReason,
  ExecExitSchema,
  ExecOutputSchema,
  ExecRequest,
  ExecResponse,
  ExecResponseSchema,
  ExecStartedSchema,
  FindWorkloadsByLabelsRequest,
  FindWorkloadsByLabelsResponse,
  FindWorkloadsByLabelsResponseSchema,
  GetWorkloadLabelsRequest,
  GetWorkloadLabelsResponse,
  GetWorkloadLabelsResponseSchema,
  InspectWorkloadRequest,
  InspectWorkloadResponse,
  InspectWorkloadResponseSchema,
  ListWorkloadsByVolumeRequest,
  ListWorkloadsByVolumeResponse,
  ListWorkloadsByVolumeResponseSchema,
  LogChunkSchema,
  LogEndSchema,
  PutArchiveRequest,
  PutArchiveResponse,
  PutArchiveResponseSchema,
  ReadyRequest,
  ReadyResponse,
  ReadyResponseSchema,
  RemoveVolumeRequest,
  RemoveVolumeResponse,
  RemoveVolumeResponseSchema,
  RemoveWorkloadRequest,
  RemoveWorkloadResponse,
  RemoveWorkloadResponseSchema,
  RunnerError,
  RunnerErrorSchema,
  RunnerEventDataSchema,
  StartWorkloadRequest,
  StartWorkloadResponse,
  StartWorkloadResponseSchema,
  StopWorkloadRequest,
  StopWorkloadResponse,
  StopWorkloadResponseSchema,
  StreamEventsRequest,
  StreamEventsResponse,
  StreamEventsResponseSchema,
  StreamWorkloadLogsRequest,
  StreamWorkloadLogsResponse,
  StreamWorkloadLogsResponseSchema,
  TargetMountSchema,
  TouchWorkloadRequest,
  TouchWorkloadResponse,
  TouchWorkloadResponseSchema,
  WorkloadContainersSchema,
  WorkloadStatus,
} from '@agyn/runner-proto';
import {
  RUNNER_SERVICE_CANCEL_EXEC_PATH,
  RUNNER_SERVICE_EXEC_PATH,
  RUNNER_SERVICE_FIND_WORKLOADS_BY_LABELS_PATH,
  RUNNER_SERVICE_GET_WORKLOAD_LABELS_PATH,
  RUNNER_SERVICE_INSPECT_WORKLOAD_PATH,
  RUNNER_SERVICE_LIST_WORKLOADS_BY_VOLUME_PATH,
  RUNNER_SERVICE_PUT_ARCHIVE_PATH,
  RUNNER_SERVICE_READY_PATH,
  RUNNER_SERVICE_REMOVE_VOLUME_PATH,
  RUNNER_SERVICE_REMOVE_WORKLOAD_PATH,
  RUNNER_SERVICE_START_WORKLOAD_PATH,
  RUNNER_SERVICE_STOP_WORKLOAD_PATH,
  RUNNER_SERVICE_STREAM_EVENTS_PATH,
  RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH,
  RUNNER_SERVICE_TOUCH_WORKLOAD_PATH,
  runnerServiceGrpcDefinition,
} from '@agyn/runner-proto/grpc.js';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { create } from '@bufbuild/protobuf';
import type { ContainerService, InteractiveExecSession, NonceCache } from '../..';
import { verifyAuthHeaders } from '../..';
import type { RunnerConfig } from '../config';
import { createDockerEventsParser } from '../dockerEvents.parser';
import { startWorkloadRequestToContainerOpts } from '../../contracts/workload.grpc';

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

const mapStatusCodeToGrpc = (statusCode: number | undefined, fallback: status): status => {
  if (typeof statusCode !== 'number' || statusCode <= 0) return fallback;
  switch (statusCode) {
    case 400:
    case 422:
      return status.INVALID_ARGUMENT;
    case 401:
      return status.UNAUTHENTICATED;
    case 403:
      return status.PERMISSION_DENIED;
    case 404:
      return status.NOT_FOUND;
    case 409:
      return status.ABORTED;
    case 412:
      return status.FAILED_PRECONDITION;
    case 429:
      return status.RESOURCE_EXHAUSTED;
    case 499:
      return status.CANCELLED;
    case 500:
      return status.INTERNAL;
    case 502:
    case 503:
    case 504:
      return status.UNAVAILABLE;
    default:
      if (statusCode >= 500) return status.UNAVAILABLE;
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
  fallbackStatus: status,
  fallbackMessage = 'runner_error',
): ServiceError => {
  const extracted = extractDockerError(error);
  const message = extracted?.message ?? errorMessageFromUnknown(error, fallbackMessage);
  const serviceError = new Error(message) as ServiceError;
  serviceError.code = mapStatusCodeToGrpc(extracted?.statusCode, fallbackStatus);
  serviceError.details = message;
  serviceError.metadata = new Metadata();
  return serviceError;
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
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => value.length > 0);
    if (!values.length) continue;
    result[key] = result[key] ? [...result[key], ...values] : values;
  }
  return result;
};

const safeStreamWrite = <T>(call: { write: (message: T) => void }, message: T): void => {
  try {
    call.write(message);
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
    startWorkload: async (
      call: ServerUnaryCall<StartWorkloadRequest, StartWorkloadResponse>,
      callback: (error: ServiceError | null, value?: StartWorkloadResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_START_WORKLOAD_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      if (!call.request?.main) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'main_container_required'));
      }
      if ((call.request.sidecars?.length ?? 0) > 0) {
        return callback(toServiceError(status.UNIMPLEMENTED, 'sidecars_not_supported'));
      }
      try {
        const containerOpts = startWorkloadRequestToContainerOpts(call.request);
        const handle = await opts.containers.start(containerOpts);
        callback(
          null,
          create(StartWorkloadResponseSchema, {
            id: handle.id,
            containers: create(WorkloadContainersSchema, { main: handle.id, sidecars: [] }),
            status: WorkloadStatus.RUNNING,
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'main_container_spec_required') {
          return callback(toServiceError(status.INVALID_ARGUMENT, error.message));
        }
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    stopWorkload: async (
      call: ServerUnaryCall<StopWorkloadRequest, StopWorkloadResponse>,
      callback: (error: ServiceError | null, value?: StopWorkloadResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_STOP_WORKLOAD_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
      }
      const timeoutSec =
        typeof call.request.timeoutSec === 'number' && call.request.timeoutSec > 0
          ? call.request.timeoutSec
          : CONTAINER_STOP_TIMEOUT_SEC;
      try {
        await opts.containers.stopContainer(workloadId, timeoutSec);
        callback(null, create(StopWorkloadResponseSchema, {}));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    removeWorkload: async (
      call: ServerUnaryCall<RemoveWorkloadRequest, RemoveWorkloadResponse>,
      callback: (error: ServiceError | null, value?: RemoveWorkloadResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_REMOVE_WORKLOAD_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
      }
      try {
        await opts.containers.removeContainer(workloadId, {
          force: call.request.force ?? false,
          removeVolumes: call.request.removeVolumes ?? false,
        });
        callback(null, create(RemoveWorkloadResponseSchema, {}));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    inspectWorkload: async (
      call: ServerUnaryCall<InspectWorkloadRequest, InspectWorkloadResponse>,
      callback: (error: ServiceError | null, value?: InspectWorkloadResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_INSPECT_WORKLOAD_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
      }
      try {
        const details = await opts.containers.inspectContainer(workloadId);
        const mounts = (details.Mounts ?? []).map((mount) =>
          create(TargetMountSchema, {
            type: mount.Type ?? '',
            source: mount.Source ?? '',
            destination: mount.Destination ?? '',
            readOnly: mount.ReadOnly === true || mount.RW === false,
          }),
        );
        callback(
          null,
          create(InspectWorkloadResponseSchema, {
            id: details.Id ?? '',
            name: details.Name ?? '',
            image: details.Image ?? '',
            configImage: details.Config?.Image ?? '',
            configLabels: details.Config?.Labels ?? {},
            mounts,
            stateStatus: details.State?.Status ?? '',
            stateRunning: details.State?.Running === true,
          }),
        );
      } catch (error) {
        callback(toDockerServiceError(error, status.NOT_FOUND));
      }
    },
    getWorkloadLabels: async (
      call: ServerUnaryCall<GetWorkloadLabelsRequest, GetWorkloadLabelsResponse>,
      callback: (error: ServiceError | null, value?: GetWorkloadLabelsResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_GET_WORKLOAD_LABELS_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
      }
      try {
        const labels = await opts.containers.getContainerLabels(workloadId);
        callback(null, create(GetWorkloadLabelsResponseSchema, { labels: labels ?? {} }));
      } catch (error) {
        callback(toDockerServiceError(error, status.NOT_FOUND));
      }
    },
    findWorkloadsByLabels: async (
      call: ServerUnaryCall<FindWorkloadsByLabelsRequest, FindWorkloadsByLabelsResponse>,
      callback: (error: ServiceError | null, value?: FindWorkloadsByLabelsResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_FIND_WORKLOADS_BY_LABELS_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const labels = call.request.labels ?? {};
      if (!labels || Object.keys(labels).length === 0) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'labels_required'));
      }
      try {
        const containers = await opts.containers.findContainersByLabels(labels, { all: call.request.all ?? false });
        callback(
          null,
          create(FindWorkloadsByLabelsResponseSchema, { targetIds: containers.map((handle) => handle.id) }),
        );
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    listWorkloadsByVolume: async (
      call: ServerUnaryCall<ListWorkloadsByVolumeRequest, ListWorkloadsByVolumeResponse>,
      callback: (error: ServiceError | null, value?: ListWorkloadsByVolumeResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_LIST_WORKLOADS_BY_VOLUME_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const volumeName = call.request.volumeName?.trim();
      if (!volumeName) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'volume_name_required'));
      }
      try {
        const ids = await opts.containers.listContainersByVolume(volumeName);
        callback(null, create(ListWorkloadsByVolumeResponseSchema, { targetIds: ids }));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    removeVolume: async (
      call: ServerUnaryCall<RemoveVolumeRequest, RemoveVolumeResponse>,
      callback: (error: ServiceError | null, value?: RemoveVolumeResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_REMOVE_VOLUME_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const volumeName = call.request.volumeName?.trim();
      if (!volumeName) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'volume_name_required'));
      }
      try {
        await opts.containers.removeVolume(volumeName, { force: call.request.force ?? false });
        callback(null, create(RemoveVolumeResponseSchema, {}));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    touchWorkload: async (
      call: ServerUnaryCall<TouchWorkloadRequest, TouchWorkloadResponse>,
      callback: (error: ServiceError | null, value?: TouchWorkloadResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_TOUCH_WORKLOAD_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
      }
      try {
        await opts.containers.touchLastUsed(workloadId);
        callback(null, create(TouchWorkloadResponseSchema, {}));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    putArchive: async (
      call: ServerUnaryCall<PutArchiveRequest, PutArchiveResponse>,
      callback: (error: ServiceError | null, value?: PutArchiveResponse) => void,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_PUT_ARCHIVE_PATH,
      });
      if (!verification.ok) {
        return callback(toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
      }
      const workloadId = call.request.workloadId?.trim();
      const targetPath = call.request.path?.trim();
      if (!workloadId || !targetPath) {
        return callback(toServiceError(status.INVALID_ARGUMENT, 'workload_id_and_path_required'));
      }
      try {
        await opts.containers.putArchive(workloadId, Buffer.from(call.request.tarPayload ?? new Uint8Array()), {
          path: targetPath,
        });
        callback(null, create(PutArchiveResponseSchema, {}));
      } catch (error) {
        callback(toDockerServiceError(error, status.UNKNOWN));
      }
    },
    streamWorkloadLogs: async (
      call: ServerWritableStream<StreamWorkloadLogsRequest, StreamWorkloadLogsResponse>,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH,
      });
      if (!verification.ok) {
        call.emit('error', toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
        return;
      }
      const workloadId = call.request.workloadId?.trim();
      if (!workloadId) {
        call.emit('error', toServiceError(status.INVALID_ARGUMENT, 'workload_id_required'));
        return;
      }

      const follow = call.request.follow !== false;
      const since = bigintToNumber(call.request.since);
      const tail = typeof call.request.tail === 'number' && call.request.tail > 0 ? call.request.tail : undefined;
      const stdout = call.request.stdout;
      const stderr = call.request.stderr;
      const timestamps = call.request.timestamps;

      let session;
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
        call.emit('error', toDockerServiceError(error, status.UNKNOWN));
        return;
      }

      const { stream } = session;
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
        call.removeListener('cancelled', onCancelled);
        call.removeListener('error', onCallError);
        call.removeListener('close', onClosed);
        try {
          await session.close();
        } catch {
          // ignore cleanup errors
        }
      };

      const onData = (chunk: unknown) => {
        const buffer = normalizeChunk(chunk);
        safeStreamWrite(
          call,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'chunk', value: create(LogChunkSchema, { data: buffer }) },
          }),
        );
      };

      const onError = async (error: unknown) => {
        safeStreamWrite(
          call,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'error', value: toRunnerStreamError(error, 'logs_stream_error', 'log stream failed') },
          }),
        );
        call.end();
        await cleanup();
      };

      const onEnd = async () => {
        safeStreamWrite(
          call,
          create(StreamWorkloadLogsResponseSchema, {
            event: { case: 'end', value: create(LogEndSchema, {}) },
          }),
        );
        call.end();
        await cleanup();
      };

      const onCancelled = () => {
        void cleanup();
      };
      const onCallError = () => {
        void cleanup();
      };
      const onClosed = () => {
        void cleanup();
      };

      stream.on('data', onData);
      stream.on('error', (error) => {
        void onError(error);
      });
      stream.on('end', () => {
        void onEnd();
      });

      call.once('cancelled', onCancelled);
      call.once('error', onCallError);
      call.once('close', onClosed);
    },
    streamEvents: async (
      call: ServerWritableStream<StreamEventsRequest, StreamEventsResponse>,
    ) => {
      const verification = verifyGrpcAuth({
        metadata: call.metadata,
        secret: opts.config.sharedSecret,
        nonceCache: opts.nonceCache,
        path: RUNNER_SERVICE_STREAM_EVENTS_PATH,
      });
      if (!verification.ok) {
        call.emit('error', toServiceError(status.UNAUTHENTICATED, verification.message ?? 'unauthorized'));
        return;
      }

      const since = bigintToNumber(call.request.since);
      const filters = buildEventFilters(call.request.filters ?? []);

      let eventsStream: NodeJS.ReadableStream;
      try {
        eventsStream = await opts.containers.getEventsStream({
          since,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
      } catch (error) {
        call.emit('error', toDockerServiceError(error, status.UNKNOWN));
        return;
      }

      let closed = false;

      const parser = createDockerEventsParser(
        (event) => {
          safeStreamWrite(
            call,
            create(StreamEventsResponseSchema, {
              event: {
                case: 'data',
                value: create(RunnerEventDataSchema, { json: JSON.stringify(event) }),
              },
            }),
          );
        },
        {
          onError: (payload, error) => {
            safeStreamWrite(
              call,
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
        call.removeListener('cancelled', onCancelled);
        call.removeListener('error', onCallError);
        call.removeListener('close', onClosed);
        const destroy = (eventsStream as NodeJS.ReadableStream & { destroy?: (error?: Error) => void }).destroy;
        if (typeof destroy === 'function') {
          destroy.call(eventsStream);
        }
      };

      const onData = (chunk: unknown) => {
        parser.handleChunk(chunk as Buffer);
      };

      const onError = (error: unknown) => {
        safeStreamWrite(
          call,
          create(StreamEventsResponseSchema, {
            event: { case: 'error', value: toRunnerStreamError(error, 'events_stream_error', 'event stream failed') },
          }),
        );
        call.end();
        cleanup();
      };

      const onEnd = () => {
        parser.flush();
        call.end();
        cleanup();
      };

      const onCancelled = () => {
        cleanup();
      };
      const onCallError = () => {
        cleanup();
      };
      const onClosed = () => {
        cleanup();
      };

      eventsStream.on('data', onData);
      eventsStream.on('error', onError);
      eventsStream.on('end', onEnd);

      call.once('cancelled', onCancelled);
      call.once('error', onCallError);
      call.once('close', onClosed);
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
