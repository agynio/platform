import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createRunnerApp } from '../src/service/app';
import type { RunnerConfig } from '../src/service/config';
import { buildAuthHeaders, canonicalBodyString } from '../src/contracts/auth';

const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const hasSocket = fs.existsSync(DEFAULT_SOCKET);
const hasDockerHost = Boolean(process.env.DOCKER_HOST);
const shouldSkip = process.env.SKIP_DOCKER_RUNNER_E2E === '1' || (!hasSocket && !hasDockerHost);

const describeOrSkip = shouldSkip ? describe.skip : describe;

if (shouldSkip) {
  const reason = process.env.SKIP_DOCKER_RUNNER_E2E === '1'
    ? 'SKIP_DOCKER_RUNNER_E2E was explicitly set'
    : 'No Docker socket found and DOCKER_HOST is not defined';
  console.warn(`Skipping docker-runner docker-backed integration tests: ${reason}`);
}

const RUNNER_SECRET = 'docker-runner-integration-secret';

type RunnerResponse = {
  statusCode: number;
  json(): unknown;
};

describeOrSkip('docker-runner docker-backed container lifecycle', () => {
  let app: FastifyInstance;
  const startedContainers = new Set<string>();

  beforeAll(async () => {
    const config: RunnerConfig = {
      port: 0,
      host: '127.0.0.1',
      sharedSecret: RUNNER_SECRET,
      signatureTtlMs: 60_000,
      dockerSocket: hasSocket ? DEFAULT_SOCKET : '',
      logLevel: 'error',
      ziti: {
        identityFile: '/tmp/ziti.identity.json',
        serviceName: 'dev.agyn-platform.platform-api',
      },
    };
    app = createRunnerApp(config);
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    for (const containerId of startedContainers) {
      try {
        await runnerRequest('POST', '/v1/containers/stop', { containerId, timeoutSec: 1 });
      } catch (error) {
        console.warn(`cleanup stop failed for ${containerId}`, error);
      }
      try {
        await runnerRequest('POST', '/v1/containers/remove', { containerId, force: true, removeVolumes: true });
      } catch (error) {
        console.warn(`cleanup remove failed for ${containerId}`, error);
      }
    }
    startedContainers.clear();
  });

  it('starts, inspects, stops, and removes a real container', async () => {
    const containerId = await startAlpineContainer('delete-once');

    const inspect = await runnerRequest('GET', `/v1/containers/inspect?containerId=${containerId}`);
    expect(inspect.statusCode).toBe(200);
    const inspectBody = inspect.json() as { Id?: string; Config?: { Image?: string } };
    expect(inspectBody?.Id).toBeDefined();
    expect(inspectBody?.Config?.Image).toContain('alpine');

    await deleteContainer(containerId);

    const afterRemove = await runnerRequest('GET', `/v1/containers/inspect?containerId=${containerId}`);
    expect(afterRemove.statusCode).toBe(404);
  }, 120_000);

  it('allows delete operations to be invoked twice without failing', async () => {
    const containerId = await startAlpineContainer('delete-twice');

    await deleteContainer(containerId);
    const secondStop = await runnerRequest('POST', '/v1/containers/stop', { containerId, timeoutSec: 1 });
    expect(secondStop.statusCode).toBe(204);
    const secondRemove = await runnerRequest('POST', '/v1/containers/remove', {
      containerId,
      force: true,
      removeVolumes: true,
    });
    expect(secondRemove.statusCode).toBe(204);
  }, 120_000);

  async function startAlpineContainer(prefix: string): Promise<string> {
    const name = `${prefix}-${randomUUID().slice(0, 8)}`;
    const response = await runnerRequest('POST', '/v1/containers/start', {
      image: 'alpine:3.19',
      cmd: ['sleep', '30'],
      name,
      autoRemove: false,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { containerId?: string };
    if (!body?.containerId) {
      throw new Error('runner start did not return containerId');
    }
    startedContainers.add(body.containerId);
    return body.containerId;
  }

  async function deleteContainer(containerId: string): Promise<void> {
    const stop = await runnerRequest('POST', '/v1/containers/stop', { containerId, timeoutSec: 1 });
    expect(stop.statusCode).toBe(204);
    const remove = await runnerRequest('POST', '/v1/containers/remove', {
      containerId,
      force: true,
      removeVolumes: true,
    });
    expect(remove.statusCode).toBe(204);
    startedContainers.delete(containerId);
  }

  async function runnerRequest(method: string, path: string, body?: unknown): Promise<RunnerResponse> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const bodyString = canonicalBodyString(body ?? '');
    const headers = buildAuthHeaders({ method, path: normalizedPath, body, secret: RUNNER_SECRET });
    const response = await app.inject({
      method,
      url: normalizedPath,
      payload: bodyString || undefined,
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
    });
    return {
      statusCode: response.statusCode,
      json: () => (response.payload ? JSON.parse(response.payload) : {}),
    };
  }
});
