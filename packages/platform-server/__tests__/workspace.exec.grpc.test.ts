import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunnerGrpcClient } from '../src/infra/container/runnerGrpc.client';
import { ContainerService, NonceCache } from '@agyn/docker-runner';
import type { RunnerConfig } from '../../docker-runner/src/service/config';
import { createRunnerGrpcServer } from '../../docker-runner/src/service/grpc/server';
import { Server, ServerCredentials } from '@grpc/grpc-js';
import type { ContainerRegistry } from '../src/infra/container/container.registry';
import { DockerWorkspaceRuntimeProvider } from '../src/workspace/providers/docker.workspace.provider';

const RUNNER_SECRET_OVERRIDE = process.env.DOCKER_RUNNER_SHARED_SECRET_OVERRIDE;
const RUNNER_SECRET = RUNNER_SECRET_OVERRIDE ?? process.env.DOCKER_RUNNER_SHARED_SECRET;
const RUNNER_ADDRESS_OVERRIDE = process.env.DOCKER_RUNNER_GRPC_ADDRESS;
const RUNNER_HOST = process.env.DOCKER_RUNNER_GRPC_HOST;
const RUNNER_PORT = process.env.DOCKER_RUNNER_GRPC_PORT;

const DEFAULT_RUNNER_HOST = 'docker-runner';
const DEFAULT_RUNNER_PORT = '50051';

const resolvedRunnerAddress =
  RUNNER_ADDRESS_OVERRIDE ??
  (RUNNER_HOST && RUNNER_PORT && !(RUNNER_HOST === DEFAULT_RUNNER_HOST && RUNNER_PORT === DEFAULT_RUNNER_PORT)
    ? `${RUNNER_HOST}:${RUNNER_PORT}`
    : undefined);

if (!RUNNER_SECRET) {
  throw new Error('Docker runner gRPC environment variables are required for workspace exec tests.');
}
const TEST_IMAGE = 'ghcr.io/agynio/devcontainer:latest';
const THREAD_ID = `grpc-exec-${Date.now()}`;
const TEST_TIMEOUT_MS = 30_000;

class NoopContainerRegistry {
  async registerStart(): Promise<void> {}
}

const registry = new NoopContainerRegistry() as unknown as ContainerRegistry;

let grpcServer: Server | undefined;
let provider: DockerWorkspaceRuntimeProvider;
let runnerClient: RunnerGrpcClient;
let workspaceId: string;
let runnerAddress = resolvedRunnerAddress;

beforeAll(async () => {
  if (!runnerAddress) {
    const runnerConfig: RunnerConfig = {
      grpcHost: '127.0.0.1',
      grpcPort: 0,
      sharedSecret: RUNNER_SECRET,
      signatureTtlMs: 60_000,
      dockerSocket: process.env.DOCKER_RUNNER_SOCKET ?? '/var/run/docker.sock',
      logLevel: 'info',
    };

    if (!process.env.DOCKER_SOCKET) {
      process.env.DOCKER_SOCKET = runnerConfig.dockerSocket;
    }

    const containers = new ContainerService();
    const nonceCache = new NonceCache({ ttlMs: runnerConfig.signatureTtlMs });
    grpcServer = createRunnerGrpcServer({ config: runnerConfig, containers, nonceCache });
    const boundPort = await new Promise<number>((resolve, reject) => {
      grpcServer!.bindAsync(
        `${runnerConfig.grpcHost}:0`,
        ServerCredentials.createInsecure(),
        (err, port) => {
          if (err) return reject(err);
          resolve(port);
        },
      );
    });
    grpcServer.start();
    runnerAddress = `${runnerConfig.grpcHost}:${boundPort}`;
  }

  runnerClient = new RunnerGrpcClient({ address: runnerAddress, sharedSecret: RUNNER_SECRET });
  provider = new DockerWorkspaceRuntimeProvider(runnerClient, registry);

  const ensure = await provider.ensureWorkspace(
    { threadId: THREAD_ID, role: 'workspace' },
    { image: TEST_IMAGE, ttlSeconds: 600 },
  );
  workspaceId = ensure.workspaceId;
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  if (workspaceId) {
    await provider.destroyWorkspace(workspaceId, { force: true }).catch(() => undefined);
  }
  if (grpcServer) {
    await new Promise<void>((resolve) => {
      grpcServer!.tryShutdown(() => resolve());
    });
  }
}, TEST_TIMEOUT_MS);

describe('DockerWorkspaceRuntimeProvider exec over gRPC runner', () => {
  it(
    'executes non-interactive echo command',
    async () => {
      const result = await provider.exec(workspaceId, { command: 'echo workspace-echo' });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('workspace-echo');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'preserves NOINPUT parity via exec',
    async () => {
      const script = "if IFS= read -r line; then printf '%s' \"$line\"; else printf 'NOINPUT'; fi";
      const result = await provider.exec(workspaceId, { command: script });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('NOINPUT');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'supports terminal sessions with cancel via ctrl-c',
    async () => {
      const session = await provider.openTerminalSession(workspaceId, { command: 'cat', tty: true });
      session.stdout.setEncoding('utf8');
      session.stdout.resume();

      const outputPromise = new Promise<string>((resolve) => {
        let buffer = '';
        session.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          if (buffer.includes('grpc interactive hello')) {
            resolve(buffer);
          }
        });
      });

      session.stdin.write('grpc interactive hello\n');
      const echoed = await outputPromise;

      await new Promise((resolve) => setTimeout(resolve, 200));
      session.stdin.write('\u0003');
      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = await session.close();
      expect(result.exitCode).toBe(130);
      expect(result.stdout).toContain('grpc interactive hello');
      expect(echoed).toContain('grpc interactive hello');
    },
    TEST_TIMEOUT_MS,
  );
});
