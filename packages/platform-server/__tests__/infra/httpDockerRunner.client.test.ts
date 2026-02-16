import { afterEach, describe, expect, it, vi } from 'vitest';

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
