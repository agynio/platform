import { setTimeout as delay } from 'node:timers/promises';
import { PassThrough, Writable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import WebSocket from 'ws';
import { fetch } from 'undici';
import type { GetEventsOptions } from 'dockerode';
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
} from '@agyn/docker-runner';
import type { DockerClient } from './dockerClient.token';

type RunnerClientConfig = {
  baseUrl: string;
  accessKey: string;
  sharedSecret: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
};

type RequestOptions = {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  expectedStatus?: number;
  timeoutMs?: number;
};

type RunnerResponse<T> = { ok: true; data: T } | { ok: false; status: number; retryable: boolean; message: string };

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class HttpDockerRunnerClient implements DockerClient {
  private readonly baseUrl: URL;
  private readonly accessKey: string;
  private readonly sharedSecret: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: RunnerClientConfig) {
    this.baseUrl = new URL(config.baseUrl);
    this.accessKey = config.accessKey;
    this.sharedSecret = config.sharedSecret;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 2;
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

  private async send<T>(options: RequestOptions): Promise<T> {
    const bodyString = options.body === undefined ? '' : canonicalJsonStringify(options.body);
    const pathWithQuery = options.query
      ? `${options.path}?${new URLSearchParams(
          Object.entries(options.query)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v ?? '')]),
        ).toString()}`
      : options.path;
    const headers = buildAuthHeaders({
      method: options.method,
      path: pathWithQuery,
      body: bodyString,
      accessKey: this.accessKey,
      secret: this.sharedSecret,
    });

    const execute = async (): Promise<RunnerResponse<T>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.requestTimeoutMs);
      try {
        const response = await fetch(this.buildUrl(options.path, options.query), {
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
            return { ok: true, data: undefined as T };
          }
          const data = (await response.json()) as T;
          return { ok: true, data };
        }
        let retryable = RETRYABLE_STATUS.has(response.status);
        try {
          const payload = (await response.json()) as { error?: { retryable?: boolean; message?: string } };
          retryable = retryable || payload?.error?.retryable === true;
          const message = payload?.error?.message ?? `Runner error ${response.status}`;
          return { ok: false, status: response.status, retryable, message };
        } catch {
          return {
            ok: false,
            status: response.status,
            retryable,
            message: `Runner error ${response.status}`,
          };
        }
      } catch (error) {
        clearTimeout(timeout);
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 0, retryable: true, message };
      }
    };

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      const result = await execute();
      if (result.ok) return result.data;
      attempt += 1;
      if (!result.retryable || attempt > this.maxRetries) {
        throw new Error(result.message);
      }
      const backoff = 200 * Math.pow(2, attempt - 1);
      await delay(backoff);
    }
    throw new Error('Runner request failed');
  }

  async touchLastUsed(containerId: string): Promise<void> {
    const body: TouchRequest = { containerId };
    await this.send({ method: 'POST', path: '/v1/containers/touch', body, expectedStatus: 204 });
  }

  async ensureImage(image: string, platform?: string): Promise<void> {
    const body: EnsureImageRequest = { image, platform };
    await this.send({ method: 'POST', path: '/v1/images/ensure', body, expectedStatus: 204 });
  }

  async start(opts?: ContainerOpts): Promise<ContainerHandle> {
    const response = await this.send<StartContainerResponse>({ method: 'POST', path: '/v1/containers/start', body: opts ?? {} });
    return new ContainerHandle(this, response.containerId);
  }

  async execContainer(containerId: string, command: string[] | string, options?: ExecOptions): Promise<ExecResult> {
    const body: ExecRunRequest = { containerId, command, options };
    return this.send<ExecRunResponse>({ method: 'POST', path: '/v1/exec/run', body });
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
      accessKey: this.accessKey,
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
    let readyResolve: (() => void) | null = null;
    let readyReject: ((reason?: unknown) => void) | null = null;
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    ws.on('message', (chunk) => {
      try {
        const payload = JSON.parse(chunk.toString()) as { type: string; data?: string; execId?: string; exitCode?: number };
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
          const err = new Error(payload.data || payload.error || 'interactive exec error');
          closeReject?.(err);
        }
      } catch (err) {
        closeReject?.(err);
      }
    });

    ws.on('error', (err) => {
      readyReject?.(err);
      closeReject?.(err);
    });

    ws.on('close', () => {
      stdout.end();
      stderr.end();
      if (closeReject) {
        closeReject(new Error('Interactive exec connection closed'));
        closeReject = null;
      }
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
      accessKey: this.accessKey,
      secret: this.sharedSecret,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
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

  async getEventsStream(options: { since?: number; filters?: GetEventsOptions['filters'] }): Promise<NodeJS.ReadableStream> {
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
      accessKey: this.accessKey,
      secret: this.sharedSecret,
    });
    const response = await fetch(url, { method: 'GET', headers });
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
