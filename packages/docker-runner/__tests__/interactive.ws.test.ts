import { PassThrough } from 'node:stream';
import type { Writable } from 'node:stream';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { createRunnerApp } from '../src/service/app';
import type { RunnerConfig } from '../src/service/config';
import { buildAuthHeaders } from '../src/contracts/auth';
import { ContainerService } from '../src/lib/container.service';

const runnerConfig: RunnerConfig = {
  port: 0,
  host: '127.0.0.1',
  sharedSecret: 'super-secret',
  signatureTtlMs: 60_000,
  dockerSocket: '/var/run/docker.sock',
  logLevel: 'error',
  ziti: {
    identityFile: '/tmp/ziti.identity.json',
    serviceName: 'dev.agyn-platform.platform-api',
  },
};

const buildQuery = () => {
  const params = new URLSearchParams({
    containerId: 'abc123',
    command: JSON.stringify(['sh']),
  });
  return params.toString();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('interactive exec websocket endpoint', () => {
  it('returns 426 for authenticated HTTP requests without upgrade', async () => {
    const app = createRunnerApp(runnerConfig);
    await app.ready();
    const query = buildQuery();
    const path = `/v1/exec/interactive/ws?${query}`;
    const headers = buildAuthHeaders({ method: 'GET', path, body: '', secret: runnerConfig.sharedSecret });

    const response = await app.inject({ method: 'GET', url: path, headers });

    expect(response.statusCode).toBe(426);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'upgrade_required' } });

    await app.close();
  });

  it('performs websocket upgrade and invokes container exec session', async () => {
    const stdin = new PassThrough() as Writable;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const closeMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const execSpy = vi
      .spyOn(ContainerService.prototype, 'openInteractiveExec')
      .mockResolvedValue({ stdin, stdout, stderr, close: closeMock, execId: 'exec-123' });

    const app = createRunnerApp(runnerConfig);
    await app.ready();

    const query = buildQuery();
    const path = `/v1/exec/interactive/ws?${query}`;
    const headers = buildAuthHeaders({ method: 'GET', path, body: '', secret: runnerConfig.sharedSecret });

    const ws = await app.injectWS(path, { headers });

    expect(execSpy).toHaveBeenCalledTimes(1);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 1000);
      ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.close();
    });

    await app.close();
  });
});
