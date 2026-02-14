import { describe, expect, it, vi } from 'vitest';

import { HttpDockerRunnerClient, EXEC_REQUEST_TIMEOUT_SLACK_MS } from '../../src/infra/container/httpDockerRunner.client';

describe('HttpDockerRunnerClient exec timeouts', () => {
  const baseConfig = {
    baseUrl: 'http://runner.internal:7071',
    sharedSecret: 'secret',
    requestTimeoutMs: 10_000,
  };

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
