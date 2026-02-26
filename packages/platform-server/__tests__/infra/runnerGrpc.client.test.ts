import { describe, expect, it, vi } from 'vitest';
import { Metadata, status } from '@grpc/grpc-js';
import { NonceCache, verifyAuthHeaders } from '@agyn/docker-runner';
import { RUNNER_SERVICE_TOUCH_WORKLOAD_PATH } from '../../src/proto/grpc.js';

import {
  RunnerGrpcClient,
  DockerRunnerRequestError,
  EXEC_REQUEST_TIMEOUT_SLACK_MS,
} from '../../src/infra/container/runnerGrpc.client';

describe('RunnerGrpcClient', () => {
  it('sends signed runner metadata on touchLastUsed calls', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner', sharedSecret: 'test-secret' });
    const captured: { metadata?: Metadata } = {};

    const touchStub = vi.fn((_: unknown, metadata: Metadata, maybeOptions?: unknown, maybeCallback?: (err: Error | null) => void) => {
      const callback = typeof maybeOptions === 'function' ? maybeOptions : maybeCallback;
      if (typeof callback !== 'function') throw new Error('callback missing');
      captured.metadata = metadata;
      callback(null);
    });

    (client as unknown as { client: { touchWorkload: typeof touchStub } }).client = {
      touchWorkload: touchStub,
    } as { touchWorkload: typeof touchStub };

    await client.touchLastUsed('container-123');

    expect(touchStub).toHaveBeenCalledTimes(1);
    expect(captured.metadata).toBeInstanceOf(Metadata);

    const headers: Record<string, string> = {};
    const metadataMap = captured.metadata?.getMap() ?? {};
    for (const [key, value] of Object.entries(metadataMap)) {
      headers[key] = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    }

    const verification = verifyAuthHeaders({
      headers,
      method: 'POST',
      path: RUNNER_SERVICE_TOUCH_WORKLOAD_PATH,
      body: '',
      secret: 'test-secret',
      nonceCache: new NonceCache(),
    });
    expect(verification.ok).toBe(true);
  });

  it('maps gRPC errors to DockerRunnerRequestError', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner', sharedSecret: 'secret' });
    const error = Object.assign(new Error('runner missing workload'), {
      code: status.NOT_FOUND,
      details: 'runner missing workload',
    });

    const translated = (client as unknown as {
      translateServiceError(err: Error, context?: { path?: string }): DockerRunnerRequestError;
    }).translateServiceError(error, { path: '/docker.runner.RunnerService/TouchWorkload' });

    expect(translated).toBeInstanceOf(DockerRunnerRequestError);
    expect(translated).toMatchObject({
      statusCode: 404,
      errorCode: 'runner_not_found',
      retryable: false,
      message: 'runner missing workload',
    });
  });
});

describe('EXEC_REQUEST_TIMEOUT_SLACK_MS', () => {
  it('matches expected slack window', () => {
    expect(EXEC_REQUEST_TIMEOUT_SLACK_MS).toBe(5_000);
  });
});
