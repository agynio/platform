import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'undici';

import { DockerRunnerRequestError, HttpDockerRunnerClient, EXEC_REQUEST_TIMEOUT_SLACK_MS } from '../../src/infra/container/httpDockerRunner.client';

describe('HttpDockerRunnerClient exec timeouts', () => {
  const baseConfig = {
    baseUrl: 'http://runner.internal:7071',
    sharedSecret: 'secret',
    requestTimeoutMs: 10_000,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extends request timeout to match exec timeout plus slack', async () => {
    const client = new HttpDockerRunnerClient(baseConfig);
    const sendSpy = vi
      .spyOn(client as unknown as { send: (options: unknown) => Promise<unknown> }, 'send')
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await client.execContainer('cid-123', 'echo hi', { timeoutMs: 60_000, idleTimeoutMs: 5_000 });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const options = sendSpy.mock.calls[0][0] as { timeoutMs?: number };
    expect(options.timeoutMs).toBe(60_000 + EXEC_REQUEST_TIMEOUT_SLACK_MS);
  });

  it('falls back to default timeout when exec request specifies no limits', async () => {
    const client = new HttpDockerRunnerClient(baseConfig);
    const sendSpy = vi
      .spyOn(client as unknown as { send: (options: unknown) => Promise<unknown> }, 'send')
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await client.execContainer('cid-123', ['echo', 'hi']);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const options = sendSpy.mock.calls[0][0] as { timeoutMs?: number };
    expect(options.timeoutMs).toBeUndefined();
  });
});

describe('HttpDockerRunnerClient network diagnostics', () => {
  const baseConfig = {
    baseUrl: 'http://runner.internal:7071',
    sharedSecret: 'secret',
    requestTimeoutMs: 500,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports ECONNREFUSED as runner_connection_refused', () => {
    const client = new HttpDockerRunnerClient(baseConfig);
    const error = new Error('fetch failed') as NodeJS.ErrnoException;
    error.code = 'ECONNREFUSED';
    const diag = (client as unknown as {
      buildNetworkError: (err: unknown, ctx: { method: string; path: string }) => DockerRunnerRequestError;
    }).buildNetworkError(error, { method: 'GET', path: '/v1/test' });

    expect(diag.errorCode).toBe('runner_connection_refused');
  });

  it('maps abort errors to runner_request_timeout', () => {
    const client = new HttpDockerRunnerClient({ ...baseConfig, requestTimeoutMs: 5 });
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const diag = (client as unknown as {
      buildNetworkError: (err: unknown, ctx: { method: string; path: string; timeoutMs?: number }) => DockerRunnerRequestError;
    }).buildNetworkError(abortError, { method: 'GET', path: '/v1/test', timeoutMs: 5 });

    expect(diag.errorCode).toBe('runner_request_timeout');
  });

  it('hits /v1/ready for connectivity checks', async () => {
    const client = new HttpDockerRunnerClient(baseConfig);
    const sendSpy = vi
      .spyOn(client as unknown as { send: (options: unknown) => Promise<unknown> }, 'send')
      .mockResolvedValue({ status: 'ready' });

    await client.checkConnectivity();

    expect(sendSpy).toHaveBeenCalledWith({ method: 'GET', path: '/v1/ready' });
  });
});

describe('HttpDockerRunnerClient exec websocket errors', () => {
  const baseConfig = {
    baseUrl: 'http://runner.internal:7071',
    sharedSecret: 'secret',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses structured error frames for missing containers', () => {
    const client = new HttpDockerRunnerClient(baseConfig);
    const payload = {
      type: 'error',
      data: JSON.stringify({
        status: 404,
        error: { code: 'no_such_container', message: 'No such container', retryable: false },
      }),
    } as { type: 'error'; data: string };

    const error = (client as unknown as {
      parseExecErrorPayload: (message: { type: 'error'; data?: string; error?: string; message?: string }) => DockerRunnerRequestError;
    }).parseExecErrorPayload(payload);

    expect(error).toBeInstanceOf(DockerRunnerRequestError);
    expect(error.statusCode).toBe(404);
    expect(error.errorCode).toBe('no_such_container');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('No such container');
  });
});

describe('HttpDockerRunnerClient retries and exec policy', () => {
  const baseConfig = {
    baseUrl: 'http://runner.internal:7071',
    sharedSecret: 'secret',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('regenerates auth headers for every retry attempt', async () => {
    const captured: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(async (_url: URL | string, init?: { headers?: Record<string, string> }) => {
      captured.push({ ...(init?.headers ?? {}) });
      if (captured.length === 1) {
        throw new Error('network glitch');
      }
      return {
        status: 204,
        ok: true,
        json: async () => undefined,
      } as Response;
    });

    const client = new HttpDockerRunnerClient({ ...baseConfig, fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.ensureImage('alpine:3');

    expect(captured).toHaveLength(2);
    expect(captured[0]['x-dr-nonce']).toBeDefined();
    expect(captured[1]['x-dr-nonce']).toBeDefined();
    expect(captured[0]['x-dr-nonce']).not.toBe(captured[1]['x-dr-nonce']);
    expect(captured[0]['x-dr-timestamp']).toBeDefined();
    expect(captured[1]['x-dr-timestamp']).toBeDefined();
    expect(captured[0]['x-dr-timestamp']).not.toBe(captured[1]['x-dr-timestamp']);
  });

  it('does not retry exec run requests by default', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('runner offline');
    });

    const client = new HttpDockerRunnerClient({ ...baseConfig, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.execContainer('cid', ['echo', 'hello'])).rejects.toBeInstanceOf(DockerRunnerRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
