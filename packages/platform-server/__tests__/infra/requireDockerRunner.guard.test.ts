import { describe, expect, it } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RequireDockerRunnerGuard } from '../../src/infra/container/requireDockerRunner.guard';
import type {
  DockerRunnerStatusService,
  DockerRunnerStatusSnapshot,
  DockerRunnerStatusState,
} from '../../src/infra/container/dockerRunnerStatus.service';

const snapshot = (status: DockerRunnerStatusState): DockerRunnerStatusSnapshot => ({
  status,
  optional: true,
  consecutiveFailures: 0,
});

const stubService = (status: DockerRunnerStatusState): DockerRunnerStatusService => {
  return {
    getSnapshot: () => snapshot(status),
  } as unknown as DockerRunnerStatusService;
};

describe('RequireDockerRunnerGuard', () => {
  it('allows activation when status service is absent', () => {
    const guard = new RequireDockerRunnerGuard(undefined);
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('allows activation when runner is up', () => {
    const guard = new RequireDockerRunnerGuard(stubService('up'));
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('throws HttpException with docker_runner_not_ready payload when runner is not ready', () => {
    const guard = new RequireDockerRunnerGuard(stubService('down'));
    try {
      guard.canActivate({} as never);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpErr.getResponse()).toEqual({
        error: {
          code: 'docker_runner_not_ready',
          message: 'docker-runner not ready',
        },
      });
    }
  });
});
