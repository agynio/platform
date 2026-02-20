import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HealthController } from '../src/infra/health/health.controller';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { createStandaloneTestConfig } from './helpers/config';

describe('HealthController', () => {

  it('includes docker runner dependency snapshot', () => {
    const config = createStandaloneTestConfig();
    const statusSvc = new DockerRunnerStatusService(config);
    const failureAt = new Date('2024-06-01T07:30:00Z');
    const nextRetryAt = new Date('2024-06-01T07:30:05Z');
    statusSvc.markFailure({ code: 'runner_unreachable', message: 'unreachable', statusCode: 503 }, 4, nextRetryAt, failureAt);
    const controller = new HealthController(statusSvc);

    const payload = controller.getHealth();
    expect(payload.status).toBe('ok');
    expect(Date.parse(payload.timestamp)).toBeGreaterThan(0);
    expect(payload.dependencies.dockerRunner).toMatchObject({
      status: 'down',
      baseUrl: config.getDockerRunnerBaseUrl(),
      optional: true,
      consecutiveFailures: 4,
      lastError: { code: 'runner_unreachable', message: 'unreachable', statusCode: 503 },
      lastFailureAt: failureAt.toISOString(),
      nextRetryAt: nextRetryAt.toISOString(),
    });
  });
});
