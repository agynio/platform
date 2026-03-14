import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Http2SessionManager } from '@connectrpc/connect-node';

import { RunnerGrpcClient } from '../src/infra/container/runnerGrpc.client';
import {
  RUNNER_SECRET,
  hasTcpDocker,
  runnerAddressMissing,
  runnerSecretMissing,
  socketMissing,
  startDockerRunner,
  type RunnerHandle,
} from './helpers/docker.e2e';

const shouldSkip = process.env.SKIP_RUNNER_EXEC_E2E === '1' || runnerAddressMissing || runnerSecretMissing;
const describeOrSkip = shouldSkip || (socketMissing && !hasTcpDocker) ? describe.skip : describe;

describeOrSkip('runner gRPC exec cancellation integration', () => {
  let runner: RunnerHandle;
  let dockerClient: RunnerGrpcClient;
  let sessionManager: Http2SessionManager | null = null;
  let containerId: string | null = null;

  beforeAll(async () => {
    const socketPath = socketMissing && hasTcpDocker ? '' : DEFAULT_SOCKET;
    runner = await startDockerRunner(socketPath);
    const baseUrl = runner.grpcAddress.startsWith('http') ? runner.grpcAddress : `http://${runner.grpcAddress}`;
    sessionManager = new Http2SessionManager(baseUrl);
    dockerClient = new RunnerGrpcClient({ address: runner.grpcAddress, sharedSecret: RUNNER_SECRET, sessionManager });
  }, 120_000);

  afterAll(async () => {
    if (containerId) {
      try {
        await dockerClient.stopContainer(containerId, 0);
      } catch {
        // ignore cleanup failures
      }
      try {
        await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      } catch {
        // ignore cleanup failures
      }
    }
    sessionManager?.abort();
    sessionManager = null;
    await runner.close();
  });

  it('treats cancelled interactive exec as graceful close', async () => {
    const handle = await dockerClient.start({
      image: 'alpine:3.19',
      cmd: ['sleep', '120'],
      labels: { 'test-suite': 'runner-exec-cancel' },
    });
    containerId = handle.id;

    const session = await dockerClient.openInteractiveExec(
      containerId,
      ['sh', '-c', 'echo ready && tail -f /dev/null'],
      { tty: true, demuxStderr: false },
    );

    await new Promise<void>((resolve) => {
      session.stdout.once('data', () => resolve());
    });

    session.stdin.destroy();

    const result = await session.close();

    expect(result.exitCode).toBe(0);

    // allow runner to settle before cleanup
    await delay(250);
  }, 120_000);
});
