import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ClientDuplexStream } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
import { NonceCache, verifyAuthHeaders } from '@agyn/docker-runner';
import { RUNNER_SERVICE_TOUCH_WORKLOAD_PATH } from '../../src/proto/grpc.js';
import type { RunnerServiceGrpcClientInstance } from '../../src/proto/grpc.js';

import {
  RunnerGrpcClient,
  RunnerGrpcExecClient,
  DockerRunnerRequestError,
  EXEC_REQUEST_TIMEOUT_SLACK_MS,
} from '../../src/infra/container/runnerGrpc.client';
import { ExecTimeoutError } from '../../src/utils/execTimeout';

class MockClientStream<Req = unknown> extends EventEmitter {
  write = vi.fn((_chunk: Req) => true);
  end = vi.fn(() => this);
  cancel = vi.fn(() => undefined);
}

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

  it('sanitizes infra details from gRPC errors', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner', sharedSecret: 'secret' });
    const error = Object.assign(new Error('Deadline exceeded after 305.002s,LB pick: 0.001s,remote_addr=172.21.0.3:7071'), {
      code: status.DEADLINE_EXCEEDED,
      details: 'Deadline exceeded after 305.002s,LB pick: 0.001s,remote_addr=172.21.0.3:7071',
    });

    const translated = (client as unknown as {
      translateServiceError(err: Error, context?: { path?: string }): DockerRunnerRequestError;
    }).translateServiceError(error, { path: '/docker.runner.RunnerService/TouchWorkload' });

    expect(translated).toBeInstanceOf(DockerRunnerRequestError);
    expect(translated).toMatchObject({
      statusCode: 504,
      errorCode: 'runner_timeout',
      retryable: true,
      message: 'Deadline exceeded after 305.002s',
    });
    expect(translated.message.includes('remote_addr')).toBe(false);
    expect(translated.message.includes('LB pick')).toBe(false);
  });
});

describe('RunnerGrpcExecClient', () => {
  it('rejects exec calls with ExecTimeoutError when the stream exceeds its deadline', async () => {
    const stream = new MockClientStream();
    const execStub = vi.fn(
      () => stream as unknown as ClientDuplexStream<unknown, unknown>,
    );
    const execClient = new RunnerGrpcExecClient({
      address: 'grpc://runner',
      sharedSecret: 'secret',
      client: { exec: execStub } as unknown as RunnerServiceGrpcClientInstance,
    });

    const execPromise = execClient.exec('container-1', ['echo', 'hi'], { timeoutMs: 1_500 });

    const error = Object.assign(new Error('Deadline exceeded after 1500ms,remote_addr=10.0.0.2:7071'), {
      code: status.DEADLINE_EXCEEDED,
      details: 'Deadline exceeded after 1500ms,remote_addr=10.0.0.2:7071',
    });

    queueMicrotask(() => {
      stream.emit('error', error);
    });

    const failure = await execPromise.catch((err) => err);

    expect(execStub).toHaveBeenCalledTimes(1);
    expect(stream.write).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.objectContaining({ case: 'start' }),
      }),
    );
    expect(failure).toBeInstanceOf(ExecTimeoutError);
    expect(failure).toMatchObject({
      timeoutMs: 1_500,
      stdout: '',
      stderr: '',
      message: 'Exec timed out after 1500ms',
    });
  });
});

describe('EXEC_REQUEST_TIMEOUT_SLACK_MS', () => {
  it('matches expected slack window', () => {
    expect(EXEC_REQUEST_TIMEOUT_SLACK_MS).toBe(5_000);
  });
});
