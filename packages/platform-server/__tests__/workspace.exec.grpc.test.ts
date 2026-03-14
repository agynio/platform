import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunnerGrpcClient } from '../src/infra/container/runnerGrpc.client';
import type { ContainerRegistry } from '../src/infra/container/container.registry';
import { DockerWorkspaceRuntimeProvider } from '../src/workspace/providers/docker.workspace.provider';

const RUNNER_SECRET_OVERRIDE = process.env.DOCKER_RUNNER_SHARED_SECRET_OVERRIDE;
const RUNNER_SECRET = RUNNER_SECRET_OVERRIDE ?? process.env.DOCKER_RUNNER_SHARED_SECRET;
const RUNNER_ADDRESS_OVERRIDE = process.env.DOCKER_RUNNER_GRPC_ADDRESS;
const RUNNER_HOST = process.env.DOCKER_RUNNER_GRPC_HOST ?? process.env.DOCKER_RUNNER_HOST;
const RUNNER_PORT = process.env.DOCKER_RUNNER_GRPC_PORT ?? process.env.DOCKER_RUNNER_PORT;

const resolvedRunnerAddress =
  RUNNER_ADDRESS_OVERRIDE ?? (RUNNER_HOST && RUNNER_PORT ? `${RUNNER_HOST}:${RUNNER_PORT}` : undefined);
const shouldRunTests = Boolean(RUNNER_SECRET && resolvedRunnerAddress);
const TEST_IMAGE = 'ghcr.io/agynio/devcontainer:latest';
const THREAD_ID = `grpc-exec-${Date.now()}`;
const TEST_TIMEOUT_MS = 30_000;

class NoopContainerRegistry {
  async registerStart(): Promise<void> {}
}

const registry = new NoopContainerRegistry() as unknown as ContainerRegistry;

let provider: DockerWorkspaceRuntimeProvider;
let runnerClient: RunnerGrpcClient;
let workspaceId: string;
const describeRunner = shouldRunTests ? describe : describe.skip;

describeRunner('DockerWorkspaceRuntimeProvider exec over gRPC runner', () => {
  beforeAll(async () => {
    runnerClient = new RunnerGrpcClient({ address: resolvedRunnerAddress!, sharedSecret: RUNNER_SECRET! });
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
  }, TEST_TIMEOUT_MS);
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
