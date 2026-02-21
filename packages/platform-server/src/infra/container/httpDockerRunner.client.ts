import { setTimeout as delay } from 'node:timers/promises';
import { PassThrough, Writable } from 'node:stream';
import type { IncomingMessage } from 'http';
import type { ReadableStream } from 'node:stream/web';
import WebSocket from 'ws';
import { fetch as undiciFetch, type Response } from 'undici';
import {
  ContainerHandle,
  type ContainerOpts,
  type ExecOptions,
  type ExecResult,
  type InteractiveExecOptions,
  type InteractiveExecSession,
  type LogsStreamOptions,
  type LogsStreamSession,
  canonicalJsonStringify,
  buildAuthHeaders,
  type EnsureImageRequest,
  type StartContainerResponse,
  type StopContainerRequest,
  type RemoveContainerRequest,
  type FindByLabelsResponse,
  type ExecRunResponse,
  type ExecRunRequest,
  type ResizeExecRequest,
  type LogsStreamQuery,
  type TouchRequest,
  type PutArchiveRequest,
  type ListByVolumeResponse,
  type RemoveVolumeRequest,
  type InspectContainerResponse,
  type FindByLabelsRequest,
  type Platform,
  type DockerEventFilters,
} from '@agyn/docker-runner';
import type { DockerClient } from './dockerClient.token';

type RunnerClientConfig = {
  baseUrl: string;
  sharedSecret: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof undiciFetch;
};

type RequestOptions = {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  expectedStatus?: number;
  timeoutMs?: number;
  maxRetries?: number;
};

const RETRYABLE_STATUS = new Set([502, 503, 504]);
type RunnerErrorBody = { error?: { code?: string; message?: string; retryable?: boolean } };

export const EXEC_REQUEST_TIMEOUT_SLACK_MS = 5_000;

type NetworkErrorContext = {
  method: string;
  path: string;
  timeoutMs?: number;
};

type RunnerExecMessage =
  | { type: 'ready'; execId: string }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; execId?: string; exitCode: number; stdout?: string; stderr?: string }
  | { type: 'error'; error?: string; data?: string; message?: string };

export class DockerRunnerRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly retryable: boolean = false,
    message?: string,
  ) {
    super(message ?? `Runner request failed (${statusCode})`);
    this.name = 'DockerRunnerRequestError';
    if (errorCode) {
      (this as { code?: string }).code = errorCode;
    }
  }
}

export class HttpDockerRunnerClient implements DockerClient {
  private readonly baseUrl: URL;
  private readonly sharedSecret: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof undiciFetch;

  constructor(config: RunnerClientConfig) {
    this.baseUrl = new URL(config.baseUrl);
    this.sharedSecret = config.sharedSecret;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetchImpl ?? undiciFetch;
  }

  getBaseUrl(): string {
    return this.baseUrl.toString();
  }

  async checkConnectivity(): Promise<{ status: string }> {
    return this.send<{ status: string }>({ method: 'GET', path: '/v1/ready' });
  }

  private buildUrl(path: string, query?: RequestOptions['query']): URL {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async buildErrorFromResponse(response: Response): Promise<DockerRunnerRequestError> {
    let text = '';
    try {
      text = await response.text();
    } catch {
      // ignore read errors; treat as empty body
    }
    let parsed: RunnerErrorBody | undefined;
    if (text.trim().length > 0) {
      try {
        parsed = JSON.parse(text) as RunnerErrorBody;
      } catch {
        // ignore malformed payloads
      }
    }

    const retryable = parsed?.error?.retryable ?? RETRYABLE_STATUS.has(response.status);
    const code = parsed?.error?.code;
    const message = parsed?.error?.message ?? `Runner error ${response.status}`;
    return new DockerRunnerRequestError(response.status, code, retryable, message);
  }

  private buildNetworkError(error: unknown, context: NetworkErrorContext): DockerRunnerRequestError {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        const timeout = context.timeoutMs ?? this.requestTimeoutMs;
        return new DockerRunnerRequestError(
          0,
          'runner_request_timeout',
          true,
          `Docker runner request ${context.method} ${context.path} timed out after ${timeout}ms (baseUrl=${this.baseUrl.origin})`,
        );
      }
      const errno = this.extractErrno(error);
      if (errno?.code) {
        const code = errno.code.toUpperCase();
        const location = this.baseUrl.origin;
        if (code === 'ECONNREFUSED') {
          return new DockerRunnerRequestError(0, 'runner_connection_refused', true, `Docker runner refused connection at ${location}`);
        }
        if (code === 'ECONNRESET') {
          return new DockerRunnerRequestError(0, 'runner_connection_reset', true, `Docker runner connection reset at ${location}`);
        }
        if (code === 'ETIMEDOUT') {
          return new DockerRunnerRequestError(0, 'runner_connection_timeout', true, `Docker runner connection timeout at ${location}`);
        }
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EHOSTUNREACH') {
          return new DockerRunnerRequestError(
            0,
            'runner_host_unreachable',
            true,
            `Docker runner host ${this.baseUrl.hostname} unreachable (${code})`,
          );
        }
      }
      const chained = this.extractErrno(error.cause);
      if (chained?.code) {
        return this.buildNetworkError(chained, context);
      }
    }
    const fallbackMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown network error';
    return new DockerRunnerRequestError(
      0,
      'runner_network_error',
      true,
      `Docker runner request ${context.method} ${context.path} failed (${this.baseUrl.origin}): ${fallbackMessage}`,
    );
  }

  private extractErrno(error: unknown): NodeJS.ErrnoException | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as Partial<NodeJS.ErrnoException> & { cause?: unknown };
    if (candidate.code && typeof candidate.code === 'string') {
      return candidate as NodeJS.ErrnoException;
    }
    if (candidate.cause && candidate.cause !== error) {
      return this.extractErrno(candidate.cause);
    }
    return undefined;
  }

  private async ensureOk(response: Response): Promise<Response> {
    if (response.ok) return response;
    throw await this.buildErrorFromResponse(response);
  }

  private async send<T>(options: RequestOptions): Promise<T> {
    const bodyString = options.body === undefined ? '' : canonicalJsonStringify(options.body);
    const pathWithQuery = options.query
      ? `${options.path}?${new URLSearchParams(
          Object.entries(options.query)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v ?? '')]),
        ).toString()}`
      : options.path;
    const maxRetries = options.maxRetries ?? this.maxRetries;

    type ExecuteResult = { success: true; data: T } | { success: false; error: DockerRunnerRequestError };

    const execute = async (): Promise<ExecuteResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.requestTimeoutMs);
      const headers = buildAuthHeaders({
        method: options.method,
        path: pathWithQuery,
        body: bodyString,
        secret: this.sharedSecret,
      });
      try {
        const response = await this.fetchImpl(this.buildUrl(options.path, options.query), {
          method: options.method,
          body: bodyString || undefined,
          headers: {
            'content-type': 'application/json',
            ...headers,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.status === (options.expectedStatus ?? 200)) {
          if (response.status === 204) {
            return { success: true, data: undefined as T };
          }
          const data = (await response.json()) as T;
          return { success: true, data };
        }
        const error = await this.buildErrorFromResponse(response);
        return { success: false, error };
      } catch (error) {
        clearTimeout(timeout);
        return {
          success: false,
          error: this.buildNetworkError(error, {
            method: options.method,
            path: pathWithQuery,
            timeoutMs: options.timeoutMs,
          }),
        };
      }
    };

    let attempt = 0;
    while (attempt <= maxRetries) {
      const result = await execute();
      if (result.success) return result.data;
      const { error } = result;
      attempt += 1;
      if (!error.retryable || attempt > maxRetries) {
        throw error;
      }
      const backoff = 200 * Math.pow(2, attempt - 1);
      await delay(backoff);
    }
    throw new DockerRunnerRequestError(0, 'runner_request_failed', true, 'Runner request failed');
  }

  private resolveExecRequestTimeout(options?: Pick<ExecOptions, 'timeoutMs' | 'idleTimeoutMs'>): number | undefined {
    if (!options) return undefined;
    const requested = Math.max(options.timeoutMs ?? 0, options.idleTimeoutMs ?? 0);
    if (requested <= 0) return undefined;
    return Math.max(this.requestTimeoutMs, requested + EXEC_REQUEST_TIMEOUT_SLACK_MS);
  }

  async touchLastUsed(containerId: string): Promise<void> {
    const body: TouchRequest = { containerId };
    await this.send({ method: 'POST', path: '/v1/containers/touch', body, expectedStatus: 204 });
  }

  async ensureImage(image: string, platform?: Platform): Promise<void> {
    const body: EnsureImageRequest = { image, platform };
    await this.send({ method: 'POST', path: '/v1/images/ensure', body, expectedStatus: 204 });
  }

  async start(opts?: ContainerOpts): Promise<ContainerHandle> {
    const response = await this.send<StartContainerResponse>({ method: 'POST', path: '/v1/containers/start', body: opts ?? {} });
    return new ContainerHandle(this, response.containerId);
  }

  async execContainer(containerId: string, command: string[] | string, options?: ExecOptions): Promise<ExecResult> {
    const body: ExecRunRequest = { containerId, command, options };
    const timeoutMs = this.resolveExecRequestTimeout(options);
    return this.send<ExecRunResponse>({ method: 'POST', path: '/v1/exec/run', body, timeoutMs, maxRetries: 0 });
  }

  async openInteractiveExec(
    containerId: string,
    command: string[] | string,
    options?: InteractiveExecOptions,
  ): Promise<InteractiveExecSession> {
    const query = new URLSearchParams({ containerId, command: Array.isArray(command) ? JSON.stringify(command) : command });
    if (options?.workdir) query.set('workdir', options.workdir);
    if (options?.tty) query.set('tty', String(options.tty));
    if (options?.demuxStderr === false) query.set('demux', 'false');
    if (options?.env) query.set('env', canonicalJsonStringify(options.env));
    const url = new URL(`/v1/exec/interactive/ws?${query.toString()}`, this.baseUrl);
    const headers = buildAuthHeaders({
      method: 'GET',
      path: `/v1/exec/interactive/ws?${query.toString()}`,
      body: '',
      secret: this.sharedSecret,
    });

    const ws = new WebSocket(url, { headers });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let execId = '';
    let closeResolver: ((value: ExecResult) => void) | null = null;
    let closeReject: ((reason?: unknown) => void) | null = null;
    const closePromise = new Promise<ExecResult>((resolve, reject) => {
      closeResolver = resolve;
      closeReject = reject;
    });
    void closePromise.catch(() => undefined);
    let readyResolve: (() => void) | null = null;
    let readyReject: ((reason?: unknown) => void) | null = null;
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    ws.on('message', (chunk) => {
      try {
        const payload = JSON.parse(chunk.toString()) as RunnerExecMessage;
        if (payload.type === 'ready' && payload.execId) {
          execId = payload.execId;
          readyResolve?.();
          readyResolve = null;
          return;
        }
        if (payload.type === 'stdout' && payload.data) {
          stdout.write(Buffer.from(payload.data, 'base64'));
          return;
        }
        if (payload.type === 'stderr' && payload.data) {
          stderr.write(Buffer.from(payload.data, 'base64'));
          return;
        }
        if (payload.type === 'exit' && typeof payload.exitCode === 'number') {
          stdout.end();
          stderr.end();
          closeResolver?.({
            exitCode: payload.exitCode,
            stdout: payload.stdout ? Buffer.from(payload.stdout, 'base64').toString('utf8') : '',
            stderr: payload.stderr ? Buffer.from(payload.stderr, 'base64').toString('utf8') : '',
          });
          closeResolver = null;
          closeReject = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
          return;
        }
        if (payload.type === 'error') {
          const err = this.parseExecErrorPayload(payload);
          stdout.end();
          stderr.end();
          if (readyReject) {
            readyReject(err);
            readyReject = null;
          }
          if (closeReject) {
            closeReject(err);
            closeReject = null;
          }
          closeResolver = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
          return;
        }
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        if (readyReject) {
          readyReject(normalized);
          readyReject = null;
        }
        if (closeReject) {
          closeReject(normalized);
          closeReject = null;
        }
      }
    });

    ws.on('error', (err) => {
      readyReject?.(err);
      closeReject?.(err);
      readyReject = null;
      closeReject = null;
    });

    ws.on('close', () => {
      stdout.end();
      stderr.end();
      if (closeReject) {
        closeReject(new Error('Interactive exec connection closed'));
        closeReject = null;
      }
    });

    ws.on('unexpected-response', (_req, res: IncomingMessage) => {
      const statusCode = typeof res.statusCode === 'number' ? res.statusCode : 500;
      const statusMessage = res.statusMessage ?? 'Runner upgrade failed';
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      res.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        const parsed = this.parseExecErrorFrame(body);
        const message = parsed?.message || body || statusMessage || 'Runner upgrade failed';
        const errorCode = parsed?.errorCode || 'runner_ws_error';
        const retryable = typeof parsed?.retryable === 'boolean' ? parsed.retryable : statusCode >= 500;
        const error = new DockerRunnerRequestError(statusCode, errorCode, retryable, message.trim() || statusMessage);
        if (readyReject) {
          readyReject(error);
          readyReject = null;
        }
        if (closeReject) {
          closeReject(error);
          closeReject = null;
        }
        try {
          ws.terminate();
        } catch {
          // ignore terminate errors
        }
      });
    });

    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        if (ws.readyState !== WebSocket.OPEN) {
          callback(new Error('WebSocket not open'));
          return;
        }
        ws.send(JSON.stringify({ type: 'stdin', data: Buffer.from(chunk).toString('base64') }), callback);
      },
      final(callback) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'close' }), callback);
          return;
        }
        callback();
      },
    });

    const close = async (): Promise<ExecResult> => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'close' }));
      return closePromise;
    };

    await readyPromise;

    return { stdin, stdout, stderr, close, execId };
  }

  private parseExecErrorPayload(payload: Extract<RunnerExecMessage, { type: 'error' }>): DockerRunnerRequestError {
    const segments: string[] = [];
    if (typeof payload.error === 'string') segments.push(payload.error);
    if (typeof payload.message === 'string') segments.push(payload.message);
    if (typeof payload.data === 'string') segments.push(payload.data);
    const structured = segments
      .map((segment) => this.parseExecErrorFrame(segment))
      .find((details) => details !== null);
    if (structured) {
      const statusCode = typeof structured.statusCode === 'number' ? structured.statusCode : 500;
      const errorCode = structured.errorCode ?? this.inferExecErrorCode(statusCode);
      const retryable = typeof structured.retryable === 'boolean' ? structured.retryable : statusCode >= 500;
      const message = structured.message ?? segments.find((value) => value.trim().length > 0) ?? 'interactive exec error';
      return new DockerRunnerRequestError(statusCode, errorCode, retryable, message);
    }
    const fallback = segments.find((value) => value.trim().length > 0) ?? 'interactive exec error';
    const inferred = this.detectExecErrorFromMessage(fallback);
    return new DockerRunnerRequestError(inferred.statusCode, inferred.code, inferred.retryable, fallback);
  }

  private parseExecErrorFrame(raw: string): { statusCode?: number; errorCode?: string; message?: string; retryable?: boolean } | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') || trimmed.length > 16_384) return null;
    try {
      const parsed = JSON.parse(trimmed) as {
        status?: number;
        statusCode?: number;
        code?: string;
        message?: string;
        retryable?: boolean;
        error?: { code?: string; message?: string; retryable?: boolean; status?: number; statusCode?: number };
      };
      const status = parsed.status ?? parsed.statusCode ?? parsed.error?.status ?? parsed.error?.statusCode;
      const code = parsed.error?.code ?? parsed.code;
      const message = parsed.error?.message ?? parsed.message;
      const retryable = parsed.error?.retryable ?? parsed.retryable;
      if (typeof status !== 'number' && typeof code !== 'string' && typeof message !== 'string') return null;
      return { statusCode: status, errorCode: code, message, retryable };
    } catch {
      return null;
    }
  }

  private detectExecErrorFromMessage(message: string): { statusCode: number; code: string; retryable: boolean } {
    const normalized = message.toLowerCase();
    if (normalized.includes('no such container')) {
      return { statusCode: 404, code: 'container_not_found', retryable: false };
    }
    if (normalized.includes('not running') || normalized.includes('already stopped')) {
      return { statusCode: 409, code: 'container_conflict', retryable: false };
    }
    return { statusCode: 500, code: 'runner_exec_error', retryable: true };
  }

  private inferExecErrorCode(statusCode: number): string {
    if (statusCode === 404) return 'container_not_found';
    if (statusCode === 409) return 'container_conflict';
    return 'runner_exec_error';
  }

  async streamContainerLogs(containerId: string, options: LogsStreamOptions = {}): Promise<LogsStreamSession> {
    const query: LogsStreamQuery = {
      containerId,
      follow: options.follow ?? true,
      since: options.since,
      tail: options.tail,
      stdout: options.stdout,
      stderr: options.stderr,
      timestamps: options.timestamps,
    };
    const path = '/v1/containers/logs/sse';
    const url = this.buildUrl(path, query as Record<string, string | number | boolean>);
    const queryString = url.searchParams.toString();
    const headers = buildAuthHeaders({
      method: 'GET',
      path: queryString ? `${path}?${queryString}` : path,
      body: '',
      secret: this.sharedSecret,
    });

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers,
    });
    await this.ensureOk(response);
    if (!response.body) throw new Error('Runner logs stream missing body');
    const stream = new PassThrough();
    const logsBody = response.body as ReadableStream<Uint8Array>;
    const reader = logsBody.getReader();
    let buffer = '';
    const handleEventBlock = (rawEvent: string) => {
      const dataLine = rawEvent
        .split('\n')
        .find((line) => line.startsWith('data:'));
      if (!dataLine) return;
      const payload = JSON.parse(dataLine.slice(5).trim()) as { type: 'chunk'; data: string } | { type: 'end' };
      if (payload.type === 'chunk') {
        const chunk = Buffer.from(payload.data, 'base64');
        stream.write(chunk);
        return;
      }
      if (payload.type === 'end') {
        stream.end();
      }
    };

    const pump = async () => {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          stream.end();
          break;
        }
        if (!result.value) continue;
        buffer += Buffer.from(result.value).toString('utf8');
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          try {
            handleEventBlock(rawEvent);
          } catch (err) {
            stream.emit('error', err);
          }
        }
      }
    };
    void pump().catch((err) => stream.emit('error', err));

    const close = async () => {
      try {
        response.body?.cancel();
      } catch {
        // ignore
      }
    };
    return { stream, close };
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void> {
    const body: ResizeExecRequest = { execId, size };
    await this.send({ method: 'POST', path: '/v1/exec/resize', body, expectedStatus: 204 });
  }

  async stopContainer(containerId: string, timeoutSec = 10): Promise<void> {
    const body: StopContainerRequest = { containerId, timeoutSec };
    await this.send({ method: 'POST', path: '/v1/containers/stop', body, expectedStatus: 204 });
  }

  async removeContainer(
    containerId: string,
    options?: boolean | { force?: boolean; removeVolumes?: boolean },
  ): Promise<void> {
    const normalized: RemoveContainerRequest = {
      containerId,
      force: typeof options === 'boolean' ? options : options?.force,
      removeVolumes: typeof options === 'boolean' ? options : options?.removeVolumes,
    };
    await this.send({ method: 'POST', path: '/v1/containers/remove', body: normalized, expectedStatus: 204 });
  }

  async getContainerLabels(containerId: string): Promise<Record<string, string> | undefined> {
    const data = await this.send<{ labels?: Record<string, string> }>({
      method: 'GET',
      path: '/v1/containers/labels',
      query: { containerId },
    });
    return data.labels;
  }

  async getContainerNetworks(containerId: string): Promise<string[]> {
    const data = await this.send<{ networks: string[] }>({
      method: 'GET',
      path: '/v1/containers/networks',
      query: { containerId },
    });
    return data.networks;
  }

  async findContainersByLabels(labels: Record<string, string>, options?: { all?: boolean }): Promise<ContainerHandle[]> {
    const body: FindByLabelsRequest = { labels, all: options?.all };
    const response = await this.send<FindByLabelsResponse>({ method: 'POST', path: '/v1/containers/findByLabels', body });
    return response.containerIds.map((id) => new ContainerHandle(this, id));
  }

  async listContainersByVolume(volumeName: string): Promise<string[]> {
    const response = await this.send<ListByVolumeResponse>({
      method: 'GET',
      path: '/v1/containers/listByVolume',
      query: { volumeName },
    });
    return response.containerIds;
  }

  async removeVolume(volumeName: string, options?: { force?: boolean }): Promise<void> {
    const body: RemoveVolumeRequest = { volumeName, force: options?.force };
    await this.send({ method: 'POST', path: '/v1/volumes/remove', body, expectedStatus: 204 });
  }

  async findContainerByLabels(labels: Record<string, string>, options?: { all?: boolean }): Promise<ContainerHandle | undefined> {
    const containers = await this.findContainersByLabels(labels, options);
    return containers[0];
  }

  async putArchive(containerId: string, data: Buffer | NodeJS.ReadableStream, options: { path: string }): Promise<void> {
    const chunks: Buffer[] = [];
    if (Buffer.isBuffer(data)) {
      chunks.push(data);
    } else {
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    const payload: PutArchiveRequest = {
      containerId,
      path: options.path,
      payloadBase64: Buffer.concat(chunks).toString('base64'),
    };
    await this.send({ method: 'POST', path: '/v1/containers/putArchive', body: payload, expectedStatus: 204 });
  }

  async inspectContainer(containerId: string): Promise<InspectContainerResponse> {
    return this.send<InspectContainerResponse>({
      method: 'GET',
      path: '/v1/containers/inspect',
      query: { containerId },
    });
  }

  async getEventsStream(options: { since?: number; filters?: DockerEventFilters }): Promise<NodeJS.ReadableStream> {
    const query: Record<string, string> = {};
    if (typeof options.since === 'number') query.since = String(options.since);
    if (options.filters) {
      query.filters = Buffer.from(JSON.stringify(options.filters)).toString('base64');
    }
    const path = '/v1/events/sse';
    const url = this.buildUrl(path, query);
    const queryString = url.searchParams.toString();
    const headers = buildAuthHeaders({
      method: 'GET',
      path: queryString ? `${path}?${queryString}` : path,
      body: '',
      secret: this.sharedSecret,
    });
    const response = await this.fetchImpl(url, { method: 'GET', headers });
    await this.ensureOk(response);
    if (!response.body) throw new Error('Runner events stream missing body');
    const stream = new PassThrough();
    const eventsBody = response.body as ReadableStream<Uint8Array>;
    const reader = eventsBody.getReader();
    let buffer = '';
    const handleEventBlock = (rawEvent: string) => {
      const dataLine = rawEvent
        .split('\n')
        .find((line) => line.startsWith('data:'));
      if (!dataLine) return;
      const payload = JSON.parse(dataLine.slice(5).trim()) as
        | { type: 'event'; event: Record<string, unknown> }
        | { type: 'error'; message: string };
      if (payload.type === 'event') {
        stream.write(`${JSON.stringify(payload.event)}\n`);
        return;
      }
      if (payload.type === 'error') {
        stream.emit('error', new Error(payload.message));
      }
    };

    const pump = async () => {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          stream.end();
          break;
        }
        if (!result.value) continue;
        buffer += Buffer.from(result.value).toString('utf8');
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          try {
            handleEventBlock(rawEvent);
          } catch (error) {
            stream.emit('error', error);
          }
        }
      }
    };
    void pump().catch((err) => stream.emit('error', err));
    stream.on('close', () => {
      try {
        response.body?.cancel();
      } catch {
        // ignore
      }
    });
    return stream;
  }
}
