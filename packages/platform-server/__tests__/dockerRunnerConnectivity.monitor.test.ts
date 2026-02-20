import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DockerRunnerConnectivityMonitor } from '../src/infra/container/dockerRunnerConnectivity.monitor';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';
import { createStandaloneTestConfig } from './helpers/config';
import type { DockerClient } from '../src/infra/container/dockerClient.token';

type MonitorHarness = {
  monitor: DockerRunnerConnectivityMonitor;
  status: DockerRunnerStatusService;
  logger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  client: DockerClient & { checkConnectivity: ReturnType<typeof vi.fn>; getBaseUrl: () => string };
};

const waitForMonitorTick = async () => new Promise<void>((resolve) => setImmediate(resolve));

function buildHarness(overrides: {
  optional?: boolean;
  maxRetries?: number;
  client?: MonitorHarness['client'];
} = {}): MonitorHarness {
  const config = createStandaloneTestConfig({
    dockerRunnerOptional: overrides.optional ?? true,
    dockerRunnerConnectRetryBaseDelayMs: 10,
    dockerRunnerConnectRetryMaxDelayMs: 10,
    dockerRunnerConnectRetryJitterMs: 0,
    dockerRunnerConnectProbeIntervalMs: 50,
    dockerRunnerConnectMaxRetries: overrides.maxRetries ?? 0,
  });

  const status = new DockerRunnerStatusService(config);
  const client =
    overrides.client ??
    ({
      checkConnectivity: vi.fn().mockResolvedValue({ status: 'ready' }),
      getBaseUrl: () => config.getDockerRunnerBaseUrl(),
    } as unknown as MonitorHarness['client']);
  const monitor = new DockerRunnerConnectivityMonitor(client, config, status);
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as MonitorHarness['logger'];
  (monitor as unknown as { logger: MonitorHarness['logger'] }).logger = logger;

  return { monitor, status, logger, client };
}


describe('DockerRunnerConnectivityMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks runner down and logs structured metadata when optional', async () => {
    const failure = new DockerRunnerRequestError(503, 'runner_unreachable', true, 'docker-runner unavailable');
    const harness = buildHarness();
    harness.client.checkConnectivity.mockRejectedValue(failure);

    await harness.monitor.onModuleInit();
    await waitForMonitorTick();

    const snapshot = harness.status.getSnapshot();
    expect(snapshot.status).toBe('down');
    expect(snapshot.consecutiveFailures).toBe(1);

    const [, , metadata] = harness.logger.error.mock.calls[0];
    expect(metadata).toMatchObject({
      dependency: 'docker-runner',
      baseUrl: snapshot.baseUrl,
      errorCode: 'runner_unreachable',
      retryInMs: 10,
      consecutiveFailures: 1,
    });
    expect(typeof metadata.nextRetryAt).toBe('string');

    await harness.monitor.onModuleDestroy();
  });

  it('throws on startup when docker-runner is required and unreachable', async () => {
    const error = new Error('connect failed');
    const harness = buildHarness({ optional: false });
    harness.client.checkConnectivity.mockRejectedValue(error);

    await expect(harness.monitor.onModuleInit()).rejects.toThrow('connect failed');
    const snapshot = harness.status.getSnapshot();
    expect(snapshot.status).toBe('down');
    await harness.monitor.onModuleDestroy();
  });

  it('marks runner up after a successful probe', async () => {
    const harness = buildHarness();

    await harness.monitor.onModuleInit();
    await waitForMonitorTick();

    const snapshot = harness.status.getSnapshot();
    expect(snapshot.status).toBe('up');
    expect(snapshot.consecutiveFailures).toBe(0);

    await harness.monitor.onModuleDestroy();
  });

  it('stops retrying once max retries are exhausted', async () => {
    vi.useFakeTimers();
    const harness = buildHarness({ maxRetries: 2 });
    harness.client.checkConnectivity.mockRejectedValue(
      new DockerRunnerRequestError(500, 'runner_unreachable', true, 'network down'),
    );

    await harness.monitor.onModuleInit();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    const exhaustionCall = harness.logger.error.mock.calls.find((call) => call[0].includes('retries exhausted'));
    expect(exhaustionCall).toBeDefined();
    const [, exhaustionMeta] = exhaustionCall as [string, Record<string, unknown>];
    expect(exhaustionMeta).toMatchObject({
      dependency: 'docker-runner',
      maxRetries: 2,
      consecutiveFailures: 2,
    });
    expect(harness.status.getSnapshot().consecutiveFailures).toBe(2);

    await harness.monitor.onModuleDestroy();
  });
});
