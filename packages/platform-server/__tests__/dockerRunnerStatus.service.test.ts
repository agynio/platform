import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { RequireDockerRunnerGuard } from '../src/infra/container/requireDockerRunner.guard';
import { createStandaloneTestConfig } from './helpers/config';

describe('DockerRunnerStatusService', () => {

  it('tracks failures and schedules next retry metadata', () => {
    const config = createStandaloneTestConfig();
    const service = new DockerRunnerStatusService(config);
    const failureAt = new Date('2024-05-01T12:00:00Z');
    const nextRetryAt = new Date('2024-05-01T12:00:05Z');

    service.markFailure({ code: 'runner_unreachable', message: 'runner down', statusCode: 503 }, 3, nextRetryAt, failureAt);

    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe('down');
    expect(snapshot.consecutiveFailures).toBe(3);
    expect(snapshot.lastFailureAt?.toISOString()).toBe(failureAt.toISOString());
    expect(snapshot.nextRetryAt?.toISOString()).toBe(nextRetryAt.toISOString());
    expect(snapshot.lastError).toMatchObject({ code: 'runner_unreachable', message: 'runner down', statusCode: 503 });
  });

  it('resets failure data when connectivity recovers', () => {
    const config = createStandaloneTestConfig();
    const service = new DockerRunnerStatusService(config);
    service.markFailure({ code: 'runner_unreachable', message: 'runner down' }, 2);

    const successAt = new Date('2024-05-01T12:10:00Z');
    const nextProbeAt = new Date('2024-05-01T12:10:30Z');
    service.markSuccess(successAt, nextProbeAt);

    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe('up');
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(snapshot.lastSuccessAt?.toISOString()).toBe(successAt.toISOString());
    expect(snapshot.nextRetryAt?.toISOString()).toBe(nextProbeAt.toISOString());
  });
});

describe('RequireDockerRunnerGuard', () => {

  it('allows requests when runner status is up', () => {
    const config = createStandaloneTestConfig();
    const statusSvc = new DockerRunnerStatusService(config);
    statusSvc.markSuccess(new Date('2024-05-01T14:00:00Z'));
    const guard = new RequireDockerRunnerGuard(statusSvc);

    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('throws a ServiceUnavailableException when runner is not ready', () => {
    const config = createStandaloneTestConfig();
    const statusSvc = new DockerRunnerStatusService(config);
    statusSvc.markFailure({ code: 'runner_unreachable', message: 'down' }, 1);
    const guard = new RequireDockerRunnerGuard(statusSvc);

    expect(() => guard.canActivate({} as never)).toThrow(ServiceUnavailableException);
  });
});
