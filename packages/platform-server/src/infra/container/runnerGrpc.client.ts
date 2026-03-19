import { randomUUID } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import {
  credentials,
  Metadata,
  status,
  type CallOptions,
  type ClientDuplexStream,
  type ClientReadableStream,
  type ServiceError,
} from '@grpc/grpc-js';
import { create, type DescMessage, type MessageInitShape, type MessageShape } from '@bufbuild/protobuf';
import { Logger } from '@nestjs/common';
import { ContainerHandle } from './container.handle';
import type {
  ContainerInspectInfo,
  ContainerOpts,
  DockerEventFilters,
  ExecOptions,
  ExecResult,
  InteractiveExecOptions,
  InteractiveExecSession,
  LogsStreamOptions,
  LogsStreamSession,
} from './dockerRunner.types';
import {
  CancelExecutionRequestSchema,
  CancelExecutionResponse,
  ExecError,
  ExecOptionsSchema,
  ExecRequest,
  ExecRequestSchema,
  ExecResponse,
  ExecStdinSchema,
  ExecStartRequestSchema,
  ExecResizeSchema,
  FindWorkloadsByLabelsRequestSchema,
  FindWorkloadsByLabelsResponse,
  GetWorkloadLabelsRequestSchema,
  GetWorkloadLabelsResponse,
  InspectWorkloadRequestSchema,
  InspectWorkloadResponse,
  ListWorkloadsByVolumeRequestSchema,
  ListWorkloadsByVolumeResponse,
  PutArchiveRequestSchema,
  ReadyRequestSchema,
  ReadyResponse,
  RemoveVolumeRequestSchema,
  RemoveWorkloadRequestSchema,
  RunnerError,
  ExecExitReason,
  StartWorkloadResponse,
  StopWorkloadRequestSchema,
  StreamEventsRequestSchema,
  StreamEventsResponse,
  StreamWorkloadLogsRequestSchema,
  StreamWorkloadLogsResponse,
  TouchWorkloadRequestSchema,
  EventFilterSchema,
  WorkloadStatus,
  type EventFilter,
  type TargetMount,
  type StartWorkloadRequest,
  type StopWorkloadRequest,
  type RemoveWorkloadRequest,
  type FindWorkloadsByLabelsRequest,
  type ListWorkloadsByVolumeRequest,
  type PutArchiveRequest,
  type ReadyRequest,
  type RemoveVolumeRequest,
  type TouchWorkloadRequest,
  type GetWorkloadLabelsRequest,
  type InspectWorkloadRequest,
} from '../../proto/gen/agynio/api/runner/v1/runner_pb.js';
import {
  RunnerServiceGrpcClient,
  type RunnerServiceGrpcClientInstance,
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
} from '../../proto/grpc.js';
import { containerOptsToStartWorkloadRequest } from './workload.grpc';
import { ExecIdleTimeoutError, ExecTimeoutError } from '../../utils/execTimeout';
import type { DockerClient } from './dockerClient.token';

export const EXEC_REQUEST_TIMEOUT_SLACK_MS = 5_000;

const RUNNER_ERROR_MESSAGE_FALLBACK = 'Runner request failed';

const INFRA_DETAIL_PATTERNS = [
  /remote_addr\s*=[^,]+/gi,
  /\bLB pick:[^,]+/gi,
  /\bresolver:[^,]+/gi,
  /\bsubchannel:[^,]+/gi,
  /\bendpoint_picker:[^,]+/gi,
];

const sanitizeInfraMessage = (message: string): string => {
  if (!message) return '';
  let sanitized = message;
  for (const pattern of INFRA_DETAIL_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ').trim();
  }
  sanitized = sanitized
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(', ');
  return sanitized.replace(/\s{2,}/g, ' ').trim();
};

const createMessage = <Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInitShape<Desc>,
): MessageShape<Desc> => create(schema, init) as MessageShape<Desc>;

const extractSanitizedServiceErrorMessage = (error: ServiceError): { sanitized: string; raw: string } => {
  const rawDetails = typeof error.details === 'string' ? error.details : '';
  const rawMessage = typeof error.message === 'string' ? error.message : '';
  const raw = rawDetails || rawMessage || '';
  const sanitizedText = sanitizeInfraMessage(raw);
  const sanitized = sanitizedText.length > 0 ? sanitizedText : RUNNER_ERROR_MESSAGE_FALLBACK;
  return { sanitized, raw };
};

export class DockerRunnerRequestError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly retryable: boolean;

  constructor(statusCode: number, errorCode: string, retryable: boolean, message: string) {
    super(message);
    this.name = 'DockerRunnerRequestError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.retryable = retryable;
    Object.setPrototypeOf(this, DockerRunnerRequestError.prototype);
  }
}

type RunnerClientConfig = {
  address: string;
  requestTimeoutMs?: number;
};

export class RunnerGrpcClient implements DockerClient {
  private readonly client: RunnerServiceGrpcClientInstance;
  private readonly execClient: RunnerGrpcExecClient;
  private readonly requestTimeoutMs: number;
  private readonly endpoint: string;
  private readonly logger = new Logger(RunnerGrpcClient.name);

  constructor(config: RunnerClientConfig) {
    if (!config.address) throw new Error('RunnerGrpcClient requires address');
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.endpoint = config.address;
    this.client = new RunnerServiceGrpcClient(config.address, credentials.createInsecure());
    this.execClient = new RunnerGrpcExecClient({
      client: this.client,
      address: config.address,
      defaultDeadlineMs: this.requestTimeoutMs,
      resolveTimeout: (options) => this.resolveExecRequestTimeout(options),
      logger: this.logger,
    });
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  async checkConnectivity(): Promise<{ status: string }> {
    const request = createMessage(ReadyRequestSchema, {});
    const response = await this.unary<ReadyRequest, ReadyResponse>(
      RUNNER_SERVICE_READY_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) this.client.ready(req, metadata, options, callback);
        else this.client.ready(req, metadata, callback);
      },
    );
    return { status: response?.status ?? 'unknown' };
  }

  async touchLastUsed(containerId: string): Promise<void> {
    const request = createMessage(TouchWorkloadRequestSchema, { workloadId: containerId });
    await this.unary<TouchWorkloadRequest, unknown>(
      RUNNER_SERVICE_TOUCH_WORKLOAD_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.touchWorkload(req, metadata, options, (err: ServiceError | null) => callback(err));
        } else {
          this.client.touchWorkload(req, metadata, (err: ServiceError | null) => callback(err));
        }
      },
    );
  }

  async ensureImage(): Promise<void> {
    // No-op: runner pulls images implicitly during container start.
  }

  async start(opts?: ContainerOpts): Promise<ContainerHandle> {
    const request = containerOptsToStartWorkloadRequest(opts ?? {}) as StartWorkloadRequest;
    const response = await this.unary<StartWorkloadRequest, StartWorkloadResponse>(
      RUNNER_SERVICE_START_WORKLOAD_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) this.client.startWorkload(req, metadata, options, callback);
        else this.client.startWorkload(req, metadata, callback);
      },
    );
    if (response.status === WorkloadStatus.FAILED) {
      const failure = response.failure;
      const retryableFlag = failure?.details?.retryable;
      const retryable = typeof retryableFlag === 'string' && (retryableFlag === 'true' || retryableFlag === '1');
      throw new DockerRunnerRequestError(
        500,
        failure?.code ?? 'runner_start_failed',
        retryable,
        failure?.message ?? 'Runner failed to start workload',
      );
    }
    const sidecarsCount = response.containers?.sidecars?.length ?? 0;
    this.logger.debug('Runner start mapping', {
      id: response.id,
      main: response.containers?.main,
      sidecars: sidecarsCount,
    });
    const containerId = response.containers?.main || response.id;
    if (!containerId) {
      throw new DockerRunnerRequestError(500, 'runner_start_missing_container', false, 'Runner did not return container id');
    }
    return new ContainerHandle(this, containerId);
  }

  async execContainer(containerId: string, command: string[] | string, options?: ExecOptions): Promise<ExecResult> {
    return this.execClient.exec(containerId, command, options);
  }

  async openInteractiveExec(
    containerId: string,
    command: string[] | string,
    options?: InteractiveExecOptions,
  ): Promise<InteractiveExecSession> {
    return this.execClient.openInteractiveExec(containerId, command, options);
  }

  async streamContainerLogs(containerId: string, options?: LogsStreamOptions): Promise<LogsStreamSession> {
    const request = createMessage(StreamWorkloadLogsRequestSchema, {
      workloadId: containerId,
      follow: options?.follow ?? true,
      since: this.normalizeSince(options?.since),
      tail: this.normalizeTail(options?.tail),
      stdout: options?.stdout ?? true,
      stderr: options?.stderr ?? true,
      timestamps: options?.timestamps ?? false,
    });
    const metadata = this.createMetadata(RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH);
    const call = this.client.streamWorkloadLogs(request, metadata) as unknown as ClientReadableStream<StreamWorkloadLogsResponse>;
    const stream = new PassThrough();

    call.on('data', (response: StreamWorkloadLogsResponse) => {
      const event = response.event;
      if (!event?.case) return;
      if (event.case === 'chunk') {
        const chunk = Buffer.from(event.value.data ?? new Uint8Array());
        if (chunk.length > 0) stream.write(chunk);
        return;
      }
      if (event.case === 'end') {
        stream.end();
        return;
      }
      if (event.case === 'error') {
        stream.emit('error', this.runnerErrorToException(event.value, 'runner_logs_error'));
      }
    });

    call.on('error', (err: ServiceError) => {
      stream.emit('error', this.translateServiceError(err, { path: RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH }));
    });

    call.on('end', () => {
      stream.end();
    });

    stream.on('close', () => {
      call.cancel();
    });

    const close = async (): Promise<void> => {
      call.cancel();
    };

    return { stream, close };
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void> {
    await this.execClient.resizeExec(execId, size);
  }

  async stopContainer(containerId: string, timeoutSec = 10): Promise<void> {
    const request = createMessage(StopWorkloadRequestSchema, { workloadId: containerId, timeoutSec });
    await this.unary<StopWorkloadRequest, unknown>(
      RUNNER_SERVICE_STOP_WORKLOAD_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.stopWorkload(req, metadata, options, (err: ServiceError | null) => callback(err));
        } else {
          this.client.stopWorkload(req, metadata, (err: ServiceError | null) => callback(err));
        }
      },
    );
  }

  async removeContainer(
    containerId: string,
    options?: boolean | { force?: boolean; removeVolumes?: boolean },
  ): Promise<void> {
    const request = createMessage(RemoveWorkloadRequestSchema, {
      workloadId: containerId,
      force: typeof options === 'boolean' ? options : options?.force ?? false,
      removeVolumes: typeof options === 'boolean' ? options : options?.removeVolumes ?? false,
    });
    await this.unary<RemoveWorkloadRequest, unknown>(
      RUNNER_SERVICE_REMOVE_WORKLOAD_PATH,
      request,
      (req, metadata, callOptions, callback) => {
        if (callOptions) {
          this.client.removeWorkload(req, metadata, callOptions, (err: ServiceError | null) => callback(err));
        } else {
          this.client.removeWorkload(req, metadata, (err: ServiceError | null) => callback(err));
        }
      },
    );
  }

  async getContainerLabels(containerId: string): Promise<Record<string, string> | undefined> {
    const request = createMessage(GetWorkloadLabelsRequestSchema, { workloadId: containerId });
    const response = await this.unary<GetWorkloadLabelsRequest, GetWorkloadLabelsResponse>(
      RUNNER_SERVICE_GET_WORKLOAD_LABELS_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) this.client.getWorkloadLabels(req, metadata, options, callback);
        else this.client.getWorkloadLabels(req, metadata, callback);
      },
    );
    return response?.labels;
  }

  async getContainerNetworks(containerId: string): Promise<string[]> {
    const inspect: ContainerInspectInfo = await this.inspectContainer(containerId);
    const networks = inspect.NetworkSettings?.Networks;
    if (!this.isRecord(networks)) return [];
    return Object.keys(networks);
  }

  async findContainersByLabels(
    labels: Record<string, string>,
    options?: { all?: boolean },
  ): Promise<ContainerHandle[]> {
    const request = createMessage(FindWorkloadsByLabelsRequestSchema, {
      labels,
      all: options?.all ?? false,
    });
    const response = await this.unary<FindWorkloadsByLabelsRequest, FindWorkloadsByLabelsResponse>(
      RUNNER_SERVICE_FIND_WORKLOADS_BY_LABELS_PATH,
      request,
      (req, metadata, callOptions, callback) => {
        if (callOptions) this.client.findWorkloadsByLabels(req, metadata, callOptions, callback);
        else this.client.findWorkloadsByLabels(req, metadata, callback);
      },
    );
    const ids = response?.targetIds ?? [];
    return ids.map((id: string) => new ContainerHandle(this, id));
  }

  async listContainersByVolume(volumeName: string): Promise<string[]> {
    const request = createMessage(ListWorkloadsByVolumeRequestSchema, { volumeName });
    const response = await this.unary<ListWorkloadsByVolumeRequest, ListWorkloadsByVolumeResponse>(
      RUNNER_SERVICE_LIST_WORKLOADS_BY_VOLUME_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) this.client.listWorkloadsByVolume(req, metadata, options, callback);
        else this.client.listWorkloadsByVolume(req, metadata, callback);
      },
    );
    return response?.targetIds ?? [];
  }

  async removeVolume(volumeName: string, options?: { force?: boolean }): Promise<void> {
    const request = createMessage(RemoveVolumeRequestSchema, {
      volumeName,
      force: options?.force ?? false,
    });
    await this.unary<RemoveVolumeRequest, unknown>(
      RUNNER_SERVICE_REMOVE_VOLUME_PATH,
      request,
      (req, metadata, callOptions, callback) => {
        if (callOptions) {
          this.client.removeVolume(req, metadata, callOptions, (err: ServiceError | null) => callback(err));
        } else {
          this.client.removeVolume(req, metadata, (err: ServiceError | null) => callback(err));
        }
      },
    );
  }

  async findContainerByLabels(
    labels: Record<string, string>,
    options?: { all?: boolean },
  ): Promise<ContainerHandle | undefined> {
    const containers = await this.findContainersByLabels(labels, options);
    return containers[0];
  }

  async putArchive(
    containerId: string,
    data: Buffer | NodeJS.ReadableStream,
    options: { path: string },
  ): Promise<void> {
    const payload = await this.toBuffer(data);
    const request = createMessage(PutArchiveRequestSchema, {
      workloadId: containerId,
      path: options.path,
      tarPayload: payload,
    });
    await this.unary<PutArchiveRequest, unknown>(
      RUNNER_SERVICE_PUT_ARCHIVE_PATH,
      request,
      (req, metadata, callOptions, callback) => {
        if (callOptions) {
          this.client.putArchive(req, metadata, callOptions, (err: ServiceError | null) => callback(err));
        } else {
          this.client.putArchive(req, metadata, (err: ServiceError | null) => callback(err));
        }
      },
      this.requestTimeoutMs,
    );
  }

  async inspectContainer(containerId: string): Promise<ContainerInspectInfo> {
    const request = createMessage(InspectWorkloadRequestSchema, { workloadId: containerId });
    const response = await this.unary<InspectWorkloadRequest, InspectWorkloadResponse>(
      RUNNER_SERVICE_INSPECT_WORKLOAD_PATH,
      request,
      (req, metadata, options, callback) => {
        if (options) this.client.inspectWorkload(req, metadata, options, callback);
        else this.client.inspectWorkload(req, metadata, callback);
      },
    );
    return this.toInspectInfo(response);
  }

  async getEventsStream(options: { since?: number; filters?: DockerEventFilters }): Promise<NodeJS.ReadableStream> {
    const request = createMessage(StreamEventsRequestSchema, {
      since: this.normalizeSince(options?.since),
      filters: this.toEventFilters(options?.filters),
    });
    const metadata = this.createMetadata(RUNNER_SERVICE_STREAM_EVENTS_PATH);
    const call = this.client.streamEvents(request, metadata) as unknown as ClientReadableStream<StreamEventsResponse>;
    const stream = new PassThrough();

    call.on('data', (response: StreamEventsResponse) => {
      const event = response.event;
      if (!event?.case) return;
      if (event.case === 'data') {
        const json = event.value.json || '{}';
        stream.write(`${json}\n`);
        return;
      }
      if (event.case === 'error') {
        stream.emit('error', this.runnerErrorToException(event.value, 'runner_events_error'));
      }
    });

    call.on('error', (err: ServiceError) => {
      stream.emit('error', this.translateServiceError(err, { path: RUNNER_SERVICE_STREAM_EVENTS_PATH }));
    });

    call.on('end', () => {
      stream.end();
    });

    stream.on('close', () => {
      call.cancel();
    });

    return stream;
  }

  private async toBuffer(data: Buffer | NodeJS.ReadableStream): Promise<Buffer> {
    if (Buffer.isBuffer(data)) return data;
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private normalizeSince(value?: number): bigint {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0n;
    return BigInt(Math.floor(value));
  }

  private normalizeTail(value?: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    return Math.max(0, Math.floor(value));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toEventFilters(filters?: DockerEventFilters): EventFilter[] {
    if (!filters) return [];
    const result: EventFilter[] = [];
    for (const [key, values] of Object.entries(filters)) {
      if (!Array.isArray(values)) continue;
      const normalized = values
        .map((value: unknown) => String(value))
        .filter((value: string) => value.length > 0);
      if (!normalized.length) continue;
      result.push(createMessage(EventFilterSchema, { key, values: normalized }));
    }
    return result;
  }

  private unary<Request, Response>(
    path: string,
    request: Request,
    invoke: (
      request: Request,
      metadata: Metadata,
      options: CallOptions | undefined,
      callback: (err: ServiceError | null, response?: Response) => void,
    ) => void,
    timeoutMs?: number,
  ): Promise<Response> {
    const metadata = this.createMetadata(path);
    const callOptions = this.buildCallOptions(timeoutMs);
    return new Promise((resolve, reject) => {
      const callback = (err: ServiceError | null, response?: Response) => {
        if (err) {
          reject(this.translateServiceError(err, { path }));
          return;
        }
        resolve(response as Response);
      };
      invoke(request, metadata, callOptions, callback);
    });
  }

  private buildCallOptions(timeoutMs?: number): CallOptions | undefined {
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : this.requestTimeoutMs;
    if (!timeout || timeout <= 0) return undefined;
    return { deadline: new Date(Date.now() + timeout) };
  }

  private createMetadata(_path: string): Metadata {
    return new Metadata();
  }

  private translateServiceError(error: ServiceError, context?: { path?: string }): DockerRunnerRequestError {
    const grpcCode = typeof error.code === 'number' ? error.code : status.UNKNOWN;
    const { sanitized: sanitizedMessage, raw: rawMessage } = extractSanitizedServiceErrorMessage(error);
    if (grpcCode === status.CANCELLED) {
      return new DockerRunnerRequestError(499, 'runner_exec_cancelled', false, sanitizedMessage);
    }
    const statusCode = this.grpcStatusToHttpStatus(grpcCode);
    const errorCode = this.grpcStatusToErrorCode(grpcCode);
    const statusName = (status as unknown as Record<number, string>)[grpcCode] ?? 'UNKNOWN';
    const path = context?.path ?? 'unknown';
    if (grpcCode === status.UNIMPLEMENTED) {
      this.logger.error(`Runner gRPC call returned UNIMPLEMENTED`, {
        path,
        grpcStatus: statusName,
        grpcCode,
        message: sanitizedMessage,
        rawMessage: rawMessage || undefined,
      });
    } else {
      this.logger.warn(`Runner gRPC call failed`, {
        path,
        grpcStatus: statusName,
        grpcCode,
        httpStatus: statusCode,
        errorCode,
        message: sanitizedMessage,
        rawMessage: rawMessage || undefined,
      });
    }
    const retryable =
      grpcCode === status.UNAVAILABLE ||
      grpcCode === status.RESOURCE_EXHAUSTED ||
      grpcCode === status.DEADLINE_EXCEEDED;
    return new DockerRunnerRequestError(statusCode, errorCode, retryable, sanitizedMessage);
  }

  private grpcStatusToHttpStatus(grpcCode: status): number {
    switch (grpcCode) {
      case status.INVALID_ARGUMENT:
        return 400;
      case status.UNAUTHENTICATED:
        return 401;
      case status.PERMISSION_DENIED:
        return 403;
      case status.NOT_FOUND:
        return 404;
      case status.ABORTED:
        return 409;
      case status.FAILED_PRECONDITION:
        return 412;
      case status.RESOURCE_EXHAUSTED:
        return 429;
      case status.UNIMPLEMENTED:
        return 501;
      case status.INTERNAL:
      case status.DATA_LOSS:
        return 500;
      case status.UNAVAILABLE:
        return 503;
      case status.DEADLINE_EXCEEDED:
        return 504;
      default:
        return 502;
    }
  }

  private grpcStatusToErrorCode(grpcCode: status): string {
    switch (grpcCode) {
      case status.INVALID_ARGUMENT:
        return 'runner_invalid_argument';
      case status.UNAUTHENTICATED:
        return 'runner_unauthenticated';
      case status.PERMISSION_DENIED:
        return 'runner_forbidden';
      case status.NOT_FOUND:
        return 'runner_not_found';
      case status.ABORTED:
        return 'runner_conflict';
      case status.FAILED_PRECONDITION:
        return 'runner_failed_precondition';
      case status.RESOURCE_EXHAUSTED:
        return 'runner_resource_exhausted';
      case status.UNIMPLEMENTED:
        return 'runner_unimplemented';
      case status.INTERNAL:
        return 'runner_internal_error';
      case status.DATA_LOSS:
        return 'runner_data_loss';
      case status.UNAVAILABLE:
        return 'runner_unavailable';
      case status.DEADLINE_EXCEEDED:
        return 'runner_timeout';
      default:
        return 'runner_grpc_error';
    }
  }

  private runnerErrorToException(error?: RunnerError | null, fallbackCode = 'runner_error'): DockerRunnerRequestError {
    if (!error) {
      return new DockerRunnerRequestError(500, fallbackCode, false, 'Runner error');
    }
    return new DockerRunnerRequestError(
      500,
      error.code || fallbackCode,
      error.retryable ?? false,
      error.message || 'Runner error',
    );
  }

  private resolveExecRequestTimeout(options?: Pick<ExecOptions, 'timeoutMs' | 'idleTimeoutMs'>): number | undefined {
    const candidates = [options?.timeoutMs, options?.idleTimeoutMs]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (!candidates.length) return undefined;
    const max = Math.max(...candidates);
    return max + EXEC_REQUEST_TIMEOUT_SLACK_MS;
  }

  private toInspectInfo(response: InspectWorkloadResponse): ContainerInspectInfo {
    const mounts = (response.mounts ?? []).map((mount: TargetMount) => ({
      Type: mount.type ?? '',
      Source: mount.source ?? '',
      Destination: mount.destination ?? '',
      RW: !mount.readOnly,
      Name: mount.source ?? undefined,
    }));

    const inspect = {
      Id: response.id ?? '',
      Name: response.name ?? undefined,
      Image: response.image ?? undefined,
      Config: {
        Image: response.configImage ?? undefined,
        Labels: response.configLabels ?? {},
      },
      Mounts: mounts,
      State:
        response.stateStatus !== undefined
          ? {
              Status: response.stateStatus,
              Running: response.stateRunning ?? false,
            }
          : undefined,
      NetworkSettings: {
        Networks: {},
      },
    };

    // The proto schema exposes a subset of Docker inspect fields; cast for compatibility with dockerode consumers.
    return inspect as unknown as ContainerInspectInfo;
  }
}

type ExecTimeoutResolver = (options?: Pick<ExecOptions, 'timeoutMs' | 'idleTimeoutMs'>) => number | undefined;

export class RunnerGrpcExecClient {
  private readonly client: RunnerServiceGrpcClientInstance;
  private readonly defaultDeadlineMs?: number;
  private readonly resolveTimeout?: ExecTimeoutResolver;
  private readonly interactiveStreams = new Map<string, ClientDuplexStream<ExecRequest, ExecResponse>>();
  private readonly logger?: Logger;

  constructor(options: {
    address: string;
    defaultDeadlineMs?: number;
    resolveTimeout?: ExecTimeoutResolver;
    client?: RunnerServiceGrpcClientInstance;
    logger?: Logger;
  }) {
    this.client = options.client ?? new RunnerServiceGrpcClient(options.address, credentials.createInsecure());
    this.defaultDeadlineMs = options.defaultDeadlineMs;
    this.resolveTimeout = options.resolveTimeout;
    this.logger = options.logger;
  }

  async exec(containerId: string, command: string[] | string, options?: ExecOptions): Promise<ExecResult> {
    const metadata = this.createMetadata(RUNNER_SERVICE_EXEC_PATH);
    const deadlineMs = this.resolveTimeout?.(options);
    const callOptions: CallOptions | undefined =
      typeof deadlineMs === 'number' && deadlineMs > 0
        ? { deadline: new Date(Date.now() + deadlineMs) }
        : undefined;
    const call = (callOptions ? this.client.exec(metadata, callOptions) : this.client.exec(metadata)) as ClientDuplexStream<
      ExecRequest,
      ExecResponse
    >;
    const execIdRef: { current?: string } = {};
    const endStream = () => {
      try {
        call.end();
      } catch {
        // ignore end errors
      }
    };
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let finished = false;
    let requestedTimeoutMs: number | undefined;
    let requestedIdleTimeoutMs: number | undefined;
    const isAborted = this.attachAbortSignal(call, options?.signal, () => execIdRef.current);
    let stdinClosed = false;
    const sendStdinEof = () => {
      if (stdinClosed) return;
      stdinClosed = true;
      try {
        call.write(
          createMessage(ExecRequestSchema, {
            msg: { case: 'stdin', value: createMessage(ExecStdinSchema, { data: new Uint8Array(), eof: true }) },
          }),
        );
      } catch {
        // ignore eof errors
      }
    };

    return new Promise<ExecResult>((resolve, reject) => {
      const finalize = (result: ExecResult) => {
        if (finished) return;
        finished = true;
        endStream();
        resolve(result);
      };

      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        endStream();
        reject(error);
      };

      call.on('data', (response: ExecResponse) => {
        const event = response.event;
        if (!event?.case) return;
        if (event.case === 'started') {
          execIdRef.current = event.value.executionId;
          sendStdinEof();
          return;
        }
        if (event.case === 'stdout') {
          const chunk = Buffer.from(event.value.data ?? new Uint8Array());
          if (chunk.length > 0) {
            stdoutChunks.push(chunk);
            options?.onOutput?.('stdout', chunk);
          }
          return;
        }
        if (event.case === 'stderr') {
          const chunk = Buffer.from(event.value.data ?? new Uint8Array());
          if (chunk.length > 0) {
            stderrChunks.push(chunk);
            options?.onOutput?.('stderr', chunk);
          }
          return;
        }
        if (event.case === 'exit') {
          const stdout = this.composeOutput(stdoutChunks, event.value.stdoutTail);
          const stderr = this.composeOutput(stderrChunks, event.value.stderrTail);
          const timeoutError = this.mapExitReasonToError(event.value.reason, {
            stdout,
            stderr,
            timeoutMs: requestedTimeoutMs,
            idleTimeoutMs: requestedIdleTimeoutMs,
          });
          if (timeoutError) {
            fail(timeoutError);
            return;
          }
          finalize({ exitCode: event.value.exitCode, stdout, stderr });
          return;
        }
        if (event.case === 'error') {
          fail(this.translateExecError(event.value));
        }
      });

      call.on('error', (err: ServiceError) => {
        if (finished) return;
        if (isAborted() && err.code === status.CANCELLED) {
          fail(new DockerRunnerRequestError(499, 'runner_exec_cancelled', false, 'Execution aborted'));
          return;
        }
        const timeoutError = this.mapGrpcDeadlineToTimeout(err, {
          stdout: this.composeOutput(stdoutChunks),
          stderr: this.composeOutput(stderrChunks),
          timeoutMs: requestedTimeoutMs,
          idleTimeoutMs: requestedIdleTimeoutMs,
        });
        if (timeoutError) {
          fail(timeoutError);
          return;
        }
        fail(this.translateServiceError(err, { path: RUNNER_SERVICE_EXEC_PATH }));
      });

      call.on('end', () => {
        if (finished) return;
        fail(new DockerRunnerRequestError(0, 'runner_stream_closed', true, 'Exec stream ended before exit event'));
      });

      const start = this.createStartRequest({ containerId, command, execOptions: options });
      const extractedTimeouts = this.extractRequestedTimeouts(start);
      requestedTimeoutMs = extractedTimeouts.timeoutMs;
      requestedIdleTimeoutMs = extractedTimeouts.idleTimeoutMs;
      call.write(start);
    });
  }

  async openInteractiveExec(
    containerId: string,
    command: string[] | string,
    options?: InteractiveExecOptions,
  ): Promise<InteractiveExecSession> {
    const metadata = this.createMetadata(RUNNER_SERVICE_EXEC_PATH);
    const call = this.client.exec(metadata) as ClientDuplexStream<ExecRequest, ExecResponse>;
    const stdout = new PassThrough();
    const stderr = options?.demuxStderr === false ? undefined : new PassThrough();
    stdout.on('error', () => undefined);
    stderr?.on('error', () => undefined);
    let startedSignaled = false;
    let syntheticReadyPending = false;
    stdout.on('newListener', (event) => {
      if (event !== 'data') return;
      if (!startedSignaled) return;
      process.nextTick(() => {
        if (!startedSignaled || !syntheticReadyPending) return;
        syntheticReadyPending = false;
        stdout.emit('data', Buffer.alloc(0));
      });
    });
    let execId: string | undefined;
    let finished = false;
    let finalResult: ExecResult | undefined;
    let cancelledLocally = false;
    let forcedTerminationReason: 'timeout' | 'idle_timeout' | undefined;
    const start = this.createStartRequest({ containerId, command, interactiveOptions: options });
    const { timeoutMs: requestedTimeoutMs, idleTimeoutMs: requestedIdleTimeoutMs } = this.extractRequestedTimeouts(start);
    let readyResolve: (() => void) | undefined;
    let readyReject: ((error: Error) => void) | undefined;
    let closeResolve: ((value: ExecResult) => void) | undefined;
    let closeReject: ((reason?: unknown) => void) | undefined;

    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const closePromise = new Promise<ExecResult>((resolve, reject) => {
      closeResolve = resolve;
      closeReject = reject;
    });

    const cleanupStream = () => {
      if (execId) this.interactiveStreams.delete(execId);
    };

    const finalize = (result: ExecResult) => {
      if (finished) return;
      finished = true;
      finalResult = result;
      cleanupStream();
      stdout.end();
      stderr?.end();
      closeResolve?.(result);
    };

    const fail = (error: Error) => {
      if (finished) return;
      if (error instanceof DockerRunnerRequestError && error.errorCode === 'runner_exec_cancelled') {
        readyResolve?.();
        readyResolve = undefined;
        readyReject = undefined;
        closeReject = undefined;
        finalize({ exitCode: 0, stdout: '', stderr: '' });
        return;
      }
      finished = true;
      cleanupStream();
      stdout.destroy(error);
      stderr?.destroy(error);
      readyReject?.(error);
      closeReject?.(error);
    };

    call.on('data', (response: ExecResponse) => {
      const event = response.event;
      if (!event?.case) return;
      if (event.case === 'started') {
        execId = event.value.executionId;
        if (execId) this.interactiveStreams.set(execId, call);
        readyResolve?.();
        readyResolve = undefined;
        readyReject = undefined;
        startedSignaled = true;
        if (stdout.listenerCount('data') > 0) {
          stdout.emit('data', Buffer.alloc(0));
        } else {
          syntheticReadyPending = true;
        }
        return;
      }
      if (event.case === 'stdout') {
        const chunk = Buffer.from(event.value.data ?? new Uint8Array());
        if (chunk.length > 0) stdout.write(chunk);
        return;
      }
      if (event.case === 'stderr') {
        const chunk = Buffer.from(event.value.data ?? new Uint8Array());
        if (!chunk.length) return;
        if (stderr) stderr.write(chunk);
        else stdout.write(chunk);
        return;
      }
      if (event.case === 'exit') {
        const stdoutTail = Buffer.from(event.value.stdoutTail ?? new Uint8Array()).toString('utf8');
        const stderrTail = Buffer.from(event.value.stderrTail ?? new Uint8Array()).toString('utf8');
        if (
          forcedTerminationReason &&
          (event.value.reason === ExecExitReason.CANCELLED || event.value.reason === ExecExitReason.COMPLETED)
        ) {
          const timeoutMs =
            forcedTerminationReason === 'timeout'
              ? this.resolveTimeoutValue(requestedTimeoutMs, requestedIdleTimeoutMs)
              : this.resolveTimeoutValue(requestedIdleTimeoutMs, requestedTimeoutMs);
          const forcedError =
            forcedTerminationReason === 'timeout'
              ? new ExecTimeoutError(timeoutMs, stdoutTail, stderrTail)
              : new ExecIdleTimeoutError(timeoutMs, stdoutTail, stderrTail);
          forcedTerminationReason = undefined;
          fail(forcedError);
          return;
        }
        forcedTerminationReason = undefined;
        const timeoutError = this.mapExitReasonToError(event.value.reason, {
          stdout: stdoutTail,
          stderr: stderrTail,
          timeoutMs: requestedTimeoutMs,
          idleTimeoutMs: requestedIdleTimeoutMs,
        });
        if (timeoutError) {
          if (cancelledLocally && event.value.reason === ExecExitReason.IDLE_TIMEOUT) {
            finalize({ exitCode: 0, stdout: stdoutTail, stderr: stderrTail });
            return;
          }
          fail(timeoutError);
          return;
        }
        finalize({ exitCode: event.value.exitCode, stdout: stdoutTail, stderr: stderrTail });
        return;
      }
      if (event.case === 'error') {
        fail(this.translateExecError(event.value));
      }
    });

    call.on('error', (err: ServiceError) => {
      if (finished) return;
      const timeoutError = this.mapGrpcDeadlineToTimeout(err, {
        stdout: finalResult?.stdout ?? '',
        stderr: finalResult?.stderr ?? '',
        timeoutMs: requestedTimeoutMs,
        idleTimeoutMs: requestedIdleTimeoutMs,
      });
      if (timeoutError) {
        fail(timeoutError);
        return;
      }
      const translated = this.translateServiceError(err, { path: RUNNER_SERVICE_EXEC_PATH });
      fail(translated);
    });

    call.on('end', () => {
      if (finished) return;
      cleanupStream();
      if (cancelledLocally) {
        finalize({ exitCode: 0, stdout: '', stderr: '' });
        return;
      }
      fail(new DockerRunnerRequestError(0, 'runner_stream_closed', true, 'Exec stream ended before exit event'));
    });

    const stdin = new Writable({
      write: (chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
        try {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding);
          if (buffer.length > 0) {
            call.write(
              createMessage(ExecRequestSchema, {
                msg: { case: 'stdin', value: createMessage(ExecStdinSchema, { data: buffer, eof: false }) },
              }),
            );
          }
          callback();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          callback(err);
        }
      },
      final: (callback: (error?: Error | null) => void) => {
        try {
          call.write(
            createMessage(ExecRequestSchema, {
              msg: { case: 'stdin', value: createMessage(ExecStdinSchema, { data: new Uint8Array(), eof: true }) },
            }),
          );
          call.end();
          callback();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          callback(err);
        }
      },
    });

    const originalDestroy = stdin.destroy.bind(stdin);
    stdin.destroy = ((error?: Error | null) => {
      if (execId) {
        void this.cancelExecution(execId).catch(() => undefined);
      }
      try {
        cancelledLocally = true;
        cleanupStream();
        call.cancel();
      } catch {
        // ignore cancellation errors
      }
      return originalDestroy(error ?? undefined);
    }) as typeof stdin.destroy;

    call.write(start);

    await readyPromise;
    const resolvedExecId = execId ?? randomUUID();
    if (!execId) this.interactiveStreams.set(resolvedExecId, call);

    const close = async (): Promise<ExecResult> => {
      if (finalResult) return finalResult;
      cancelledLocally = true;
      if (execId) {
        try {
          await this.cancelExecution(execId);
        } catch {
          // ignore cancellation errors
        }
      }
      try {
        stdin.end();
      } catch {
        // ignore
      }
      try {
        call.end();
      } catch {
        // ignore
      }
      try {
        call.cancel();
      } catch {
        // ignore cancellation errors
      }
      if (!finished) {
        const result: ExecResult = { exitCode: 0, stdout: '', stderr: '' };
        finalize(result);
        return result;
      }
      return closePromise;
    };

    const terminateProcessGroup = async (reason: 'timeout' | 'idle_timeout'): Promise<void> => {
      const targetExecId = execId ?? resolvedExecId;
      if (!targetExecId) {
        throw new DockerRunnerRequestError(404, 'runner_exec_not_found', false, 'Execution not active');
      }
      this.logger?.warn('Requesting runner exec termination', {
        execId: targetExecId,
        reason,
      });
      forcedTerminationReason = reason;
      try {
        const cancelled = await this.cancelExecution(targetExecId, true);
        if (cancelled) {
          cancelledLocally = true;
          return;
        }
        forcedTerminationReason = undefined;
        this.logger?.warn('Runner exec termination request acknowledged, execution already finished', {
          execId: targetExecId,
          reason,
        });
      } catch (error) {
        forcedTerminationReason = undefined;
        throw error;
      }
    };

    return { stdin, stdout, stderr, close, execId: resolvedExecId, terminateProcessGroup };
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void> {
    const call = this.interactiveStreams.get(execId);
    if (!call) {
      throw new DockerRunnerRequestError(404, 'runner_exec_not_found', false, `Execution ${execId} not active`);
    }
    const cols = Math.max(0, Math.floor(size.cols));
    const rows = Math.max(0, Math.floor(size.rows));
    try {
      call.write(
        createMessage(ExecRequestSchema, { msg: { case: 'resize', value: createMessage(ExecResizeSchema, { cols, rows }) } }),
      );
    } catch (error) {
      throw new DockerRunnerRequestError(
        0,
        'runner_exec_resize_failed',
        true,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async cancelExecution(executionId: string, force = false): Promise<boolean> {
    const metadata = this.createMetadata(RUNNER_SERVICE_CANCEL_EXEC_PATH);
    const deadlineMs = this.defaultDeadlineMs;
    const callOptions: CallOptions | undefined =
      typeof deadlineMs === 'number' && deadlineMs > 0
        ? { deadline: new Date(Date.now() + deadlineMs) }
        : undefined;
    const request = createMessage(CancelExecutionRequestSchema, { executionId, force });
    return new Promise<boolean>((resolve, reject) => {
      const callback = (err: ServiceError | null, response?: CancelExecutionResponse) => {
        if (err) {
          reject(this.translateServiceError(err, { path: RUNNER_SERVICE_CANCEL_EXEC_PATH }));
          return;
        }
        resolve(response?.cancelled ?? false);
      };
      if (callOptions) {
        this.client.cancelExecution(request, metadata, callOptions, callback);
      } else {
        this.client.cancelExecution(request, metadata, callback);
      }
    });
  }

  private createMetadata(_path: string): Metadata {
    return new Metadata();
  }

  private createStartRequest(params: {
    containerId: string;
    command: string[] | string;
    execOptions?: ExecOptions;
    interactiveOptions?: InteractiveExecOptions;
  }) {
    const commandArgv = Array.isArray(params.command) ? params.command : [];
    const commandShell = Array.isArray(params.command) ? '' : params.command;
    const execOpts = params.execOptions ?? {};
    const interactiveOpts = params.interactiveOptions ?? {};
    const env = this.normalizeEnv(execOpts.env ?? interactiveOpts.env);
    const timeoutMs = this.toBigInt(execOpts.timeoutMs);
    const idleTimeoutMs = this.toBigInt(execOpts.idleTimeoutMs);
    const start = createMessage(ExecStartRequestSchema, {
      requestId: randomUUID(),
      targetId: params.containerId,
      commandArgv,
      commandShell,
      options: createMessage(ExecOptionsSchema, {
        workdir: execOpts.workdir ?? interactiveOpts.workdir ?? undefined,
        env,
        timeoutMs: timeoutMs && timeoutMs > 0n ? timeoutMs : undefined,
        idleTimeoutMs: idleTimeoutMs && idleTimeoutMs > 0n ? idleTimeoutMs : undefined,
        tty: execOpts.tty ?? interactiveOpts.tty ?? false,
        killOnTimeout: execOpts.killOnTimeout ?? false,
        logToPid1: execOpts.logToPid1 ?? false,
        separateStderr: interactiveOpts.demuxStderr ?? true,
      }),
    });
    return createMessage(ExecRequestSchema, { msg: { case: 'start', value: start } });
  }

  private extractRequestedTimeouts(start: ExecRequest): { timeoutMs?: number; idleTimeoutMs?: number } {
    if (start.msg?.case !== 'start') {
      return {};
    }
    const options = start.msg.value.options;
    if (!options) {
      return {};
    }
    return {
      timeoutMs: this.fromBigInt(options.timeoutMs),
      idleTimeoutMs: this.fromBigInt(options.idleTimeoutMs),
    };
  }

  private normalizeEnv(env?: Record<string, string> | string[]): Array<{ name: string; value: string }> {
    if (!env) return [];
    if (Array.isArray(env)) {
      return env.map((entry: string) => {
        const idx = entry.indexOf('=');
        if (idx === -1) return { name: entry, value: '' };
        return { name: entry.slice(0, idx), value: entry.slice(idx + 1) };
      });
    }
    return Object.entries(env).map(([name, value]: [string, string]) => ({ name, value }));
  }

  private toBigInt(value?: number): bigint | undefined {
    if (typeof value !== 'number') return undefined;
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return BigInt(Math.floor(value));
  }

  private fromBigInt(value?: bigint): number | undefined {
    if (typeof value !== 'bigint') return undefined;
    const result = Number(value);
    if (!Number.isFinite(result) || result <= 0) return undefined;
    return result;
  }

  private composeOutput(chunks: Buffer[], tail?: Uint8Array): string {
    if (chunks.length > 0) {
      return Buffer.concat(chunks).toString('utf8');
    }
    if (tail && tail.length > 0) {
      return Buffer.from(tail).toString('utf8');
    }
    return '';
  }

  private translateExecError(error: ExecError): DockerRunnerRequestError {
    const code = error.code || 'runner_exec_error';
    const message = error.message || 'runner exec error';
    return new DockerRunnerRequestError(500, code, error.retryable ?? false, message);
  }

  private mapExitReasonToError(
    reason: ExecExitReason,
    context: { stdout: string; stderr: string; timeoutMs?: number; idleTimeoutMs?: number },
  ): Error | undefined {
    if (reason === ExecExitReason.TIMEOUT) {
      const timeoutMs = this.resolveTimeoutValue(context.timeoutMs, context.idleTimeoutMs);
      return new ExecTimeoutError(timeoutMs, context.stdout, context.stderr);
    }
    if (reason === ExecExitReason.IDLE_TIMEOUT) {
      const timeoutMs = this.resolveTimeoutValue(context.idleTimeoutMs, context.timeoutMs);
      return new ExecIdleTimeoutError(timeoutMs, context.stdout, context.stderr);
    }
    return undefined;
  }

  private mapGrpcDeadlineToTimeout(
    error: ServiceError,
    context: { stdout: string; stderr: string; timeoutMs?: number; idleTimeoutMs?: number },
  ): ExecTimeoutError | undefined {
    if (error.code !== status.DEADLINE_EXCEEDED) return undefined;
    const resolved = this.resolveTimeoutValue(context.timeoutMs, context.idleTimeoutMs);
    const effectiveTimeout = resolved > 0 ? resolved : this.defaultDeadlineMs ?? 0;
    return new ExecTimeoutError(effectiveTimeout, context.stdout, context.stderr);
  }

  private resolveTimeoutValue(primary?: number, fallback?: number): number {
    if (typeof primary === 'number' && primary > 0) return primary;
    if (typeof fallback === 'number' && fallback > 0) return fallback;
    return 0;
  }

  private translateServiceError(error: ServiceError, context?: { path?: string }): DockerRunnerRequestError {
    const grpcCode = typeof error.code === 'number' ? error.code : status.UNKNOWN;
    const { sanitized: sanitizedMessage, raw: rawMessage } = extractSanitizedServiceErrorMessage(error);
    if (grpcCode === status.CANCELLED) {
      return new DockerRunnerRequestError(499, 'runner_exec_cancelled', false, sanitizedMessage);
    }
    const statusName = (status as unknown as Record<number, string>)[grpcCode] ?? 'UNKNOWN';
    const path = context?.path ?? RUNNER_SERVICE_EXEC_PATH;
    if (grpcCode === status.UNIMPLEMENTED) {
      this.logger?.error(`Runner exec gRPC call returned UNIMPLEMENTED`, {
        path,
        grpcStatus: statusName,
        grpcCode,
        message: sanitizedMessage,
        rawMessage: rawMessage || undefined,
      });
    } else {
      this.logger?.warn(`Runner exec gRPC call failed`, {
        path,
        grpcStatus: statusName,
        grpcCode,
        message: sanitizedMessage,
        rawMessage: rawMessage || undefined,
      });
    }
    const retryable =
      grpcCode === status.UNAVAILABLE ||
      grpcCode === status.RESOURCE_EXHAUSTED ||
      grpcCode === status.DEADLINE_EXCEEDED;
    return new DockerRunnerRequestError(0, 'runner_grpc_error', retryable, sanitizedMessage);
  }

  private attachAbortSignal(
    call: ClientDuplexStream<ExecRequest, ExecResponse>,
    signal: AbortSignal | undefined,
    resolveExecId: () => string | undefined,
  ): () => boolean {
    if (!signal) return () => false;
    const abortHandler = () => {
      const execId = resolveExecId();
      if (execId) {
        void this.cancelExecution(execId).catch(() => undefined);
      }
      try {
        call.cancel();
      } catch {
        // ignore cancellation errors
      }
    };
    if (signal.aborted) {
      abortHandler();
      return () => true;
    }
    signal.addEventListener('abort', abortHandler, { once: true });
    return () => signal.aborted;
  }
}
