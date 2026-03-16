import { describe, expect, it, vi } from 'vitest';
import {
  Code,
  ConnectError,
  createContextValues,
  type Interceptor,
  type UnaryRequest,
  type UnaryResponse,
  type Client,
} from '@connectrpc/connect';
import { NonceCache, verifyAuthHeaders } from '@agyn/docker-runner';
import {
  ExecRequest,
  ExecResponse,
  TouchWorkloadRequestSchema,
  TouchWorkloadResponseSchema,
  RunnerService,
} from '../../src/proto/gen/agynio/api/runner/v1/runner_pb.js';
import { create } from '@bufbuild/protobuf';

import {
  RunnerGrpcClient,
  RunnerGrpcExecClient,
  DockerRunnerRequestError,
  EXEC_REQUEST_TIMEOUT_SLACK_MS,
} from '../../src/infra/container/runnerGrpc.client';
import { ExecTimeoutError } from '../../src/utils/execTimeout';

const runnerServicePath = (method: keyof typeof RunnerService.method): string =>
  `/${RunnerService.typeName}/${RunnerService.method[method].name}`;

type RunnerServiceClient = Client<typeof RunnerService>;
type RunnerGrpcClientPrivate = {
  createAuthInterceptor: () => Interceptor;
};

describe('RunnerGrpcClient', () => {
  it('sends signed runner metadata on touchLastUsed calls', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner', sharedSecret: 'test-secret' });
    const interceptor = (client as unknown as RunnerGrpcClientPrivate).createAuthInterceptor();
    const headers = new Headers();
    const path = runnerServicePath('touchWorkload');
    const request: UnaryRequest = {
      stream: false,
      service: RunnerService,
      method: RunnerService.method.touchWorkload,
      requestMethod: 'POST',
      url: `http://runner${path}`,
      signal: new AbortController().signal,
      header: headers,
      contextValues: createContextValues(),
      message: create(TouchWorkloadRequestSchema, { workloadId: 'container-123' }),
    };
    const next = vi.fn(async (): Promise<UnaryResponse> => ({
      stream: false,
      service: RunnerService,
      method: RunnerService.method.touchWorkload,
      header: new Headers(),
      trailer: new Headers(),
      message: create(TouchWorkloadResponseSchema, {}),
    }));

    await interceptor(next)(request);

    const capturedHeaders: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      capturedHeaders[key] = value;
    }

    const verification = verifyAuthHeaders({
      headers: capturedHeaders,
      method: 'POST',
      path,
      body: '',
      secret: 'test-secret',
      nonceCache: new NonceCache(),
    });
    expect(verification.ok).toBe(true);
  });

  it('sanitizes infra details from gRPC errors', async () => {
    const client = new RunnerGrpcClient({ address: 'grpc://runner', sharedSecret: 'secret' });
    const error = new ConnectError(
      'Deadline exceeded after 305.002s,LB pick: 0.001s,remote_addr=172.21.0.3:50051',
      Code.DeadlineExceeded,
    );

    const translated = (client as unknown as {
      translateServiceError(err: unknown, context?: { path?: string }): DockerRunnerRequestError;
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
    const captured: { request?: ExecRequest } = {};
    const execStub = vi.fn((requests: AsyncIterable<ExecRequest>) => {
      const capturePromise = (async () => {
        const iterator = requests[Symbol.asyncIterator]();
        const first = await iterator.next();
        captured.request = first.value;
      })();
      async function* responses(): AsyncIterable<ExecResponse> {
        await capturePromise;
        throw new ConnectError(
          'Deadline exceeded after 1500ms,remote_addr=10.0.0.2:50051',
          Code.DeadlineExceeded,
        );
      }
      return responses();
    });
    const execClient = new RunnerGrpcExecClient({
      address: 'grpc://runner',
      sharedSecret: 'secret',
      client: { exec: execStub, cancelExecution: vi.fn() } as unknown as RunnerServiceClient,
    });

    const execPromise = execClient.exec('container-1', ['echo', 'hi'], { timeoutMs: 1_500 });

    const failure = await execPromise.catch((err) => err);

    expect(execStub).toHaveBeenCalledTimes(1);
    expect(captured.request).toEqual(
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
