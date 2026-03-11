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
  SidecarInstance,
  SidecarInstanceSchema,
  WorkloadContainersSchema,
  WorkloadStatus,
} from '../../proto/gen/agynio/api/runner/v1/runner_pb.js';
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
} from '../../proto/grpc.js';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { create } from '@bufbuild/protobuf';
import type { ContainerService, InteractiveExecSession, LogsStreamSession, NonceCache } from '../..';
import type { ContainerHandle } from '../../lib/container.handle';
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
  cancelRequested: boolean;
  timers: {
    timeout?: NodeJS.Timeout;
    idle?: NodeJS.Timeout;
  };
  reason: ExecExitReason;
  killed: boolean;
  finish?: (reason: ExecExitReason, killed?: boolean) => Promise<void>;
};

const activeExecutions = new Map<string, ExecutionContext>();

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
      .map((value: string | undefined) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string): value is string => value.length > 0);
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
      try {
        const containerOpts = startWorkloadRequestToContainerOpts(call.request);
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

        callback(
          null,
          create(StartWorkloadResponseSchema, {
            id: mainHandle.id,
            containers: create(WorkloadContainersSchema, { main: mainHandle.id, sidecars: sidecarInstances }),
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
        typeof call.request.timeoutSec === 'number' && call.request.timeoutSec >= 0
          ? call.request.timeoutSec
          : CONTAINER_STOP_TIMEOUT_SEC;
      try {
        await stopSidecars(opts.containers, workloadId, timeoutSec);
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
        await removeSidecars(opts.containers, workloadId, {
          force: call.request.force ?? false,
          removeVolumes: call.request.removeVolumes ?? false,
        });
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
          create(FindWorkloadsByLabelsResponseSchema, {
            targetIds: containers.map((handle: ContainerHandle) => handle.id),
          }),
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
        (event: Record<string, unknown>) => {
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
          onError: (payload: string, error: unknown) => {
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

      const clearTimers = clearExecutionTimers;

      const finish = async (target: ExecutionContext, reason: ExecExitReason, killed = false) => {
        if (!target || target.finished) return;
        target.finished = true;
        target.reason = reason;
        target.killed = killed;
        clearTimers(target);
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

      call.on('data', async (req: ExecRequest) => {
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
              cancelRequested: false,
              timers: {},
              reason: ExecExitReason.COMPLETED,
              killed: false,
            };
            ctx = context;
            context.finish = (reason: ExecExitReason, killed?: boolean) => finish(context, reason, killed);
            activeExecutions.set(context.executionId, context);

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
        if (!ctx || ctx.finished) return;
        ctx.cancelRequested = true;
        clearTimers(ctx);
        void finish(ctx, ExecExitReason.CANCELLED, false);
      });

      call.once('cancelled', () => {
        if (!ctx || ctx.finished) return;
        ctx.cancelRequested = true;
        clearTimers(ctx);
        void finish(ctx, ExecExitReason.CANCELLED, ctx.killed);
      });

      call.on('close', () => {
        if (!ctx || ctx.finished) return;
        ctx.cancelRequested = true;
        clearTimers(ctx);
        void finish(ctx, ExecExitReason.CANCELLED, ctx.killed);
      });

      call.on('error', () => {
        if (!ctx || ctx.finished) return;
        clearTimers(ctx);
        void finish(ctx, ExecExitReason.RUNNER_ERROR, ctx.killed);
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
      ctx.cancelRequested = true;
      clearExecutionTimers(ctx);
      if (ctx.finished) {
        return callback(null, create(CancelExecutionResponseSchema, { cancelled: true }));
      }
      ctx.finish?.(ExecExitReason.CANCELLED, call.request.force).catch(() => {
        // finish already emits structured error; swallow here
      });
      callback(null, create(CancelExecutionResponseSchema, { cancelled: true }));
    },
  });

  return server;
}
