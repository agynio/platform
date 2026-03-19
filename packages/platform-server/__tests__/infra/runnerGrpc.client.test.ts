import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ClientDuplexStream } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
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
  it('sends empty runner metadata on touchLastUsed calls', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner' });
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
    expect(Object.keys(captured.metadata?.getMap() ?? {})).toHaveLength(0);
  });

  it('sanitizes infra details from gRPC errors', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner' });
    const error = Object.assign(new Error('Deadline exceeded after 305.002s,LB pick: 0.001s,remote_addr=172.21.0.3:50051'), {
      code: status.DEADLINE_EXCEEDED,
      details: 'Deadline exceeded after 305.002s,LB pick: 0.001s,remote_addr=172.21.0.3:50051',
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
      client: { exec: execStub } as unknown as RunnerServiceGrpcClientInstance,
    });

    const execPromise = execClient.exec('container-1', ['echo', 'hi'], { timeoutMs: 1_500 });

    const error = Object.assign(new Error('Deadline exceeded after 1500ms,remote_addr=10.0.0.2:50051'), {
      code: status.DEADLINE_EXCEEDED,
      details: 'Deadline exceeded after 1500ms,remote_addr=10.0.0.2:50051',
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
