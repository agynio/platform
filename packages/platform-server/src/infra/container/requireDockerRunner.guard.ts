import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, Inject } from '@nestjs/common';

import { DockerRunnerStatusService } from './dockerRunnerStatus.service';

@Injectable()
export class RequireDockerRunnerGuard implements CanActivate {
  constructor(@Inject(DockerRunnerStatusService) private readonly status: DockerRunnerStatusService) {}

  canActivate(_context: ExecutionContext): boolean {
    const snapshot = this.status.getSnapshot();
    if (snapshot.status === 'up') {
      return true;
    }
    throw new ServiceUnavailableException({
      error: {
        code: 'docker_runner_not_ready',
        message: 'docker-runner not ready',
      },
    });
  }
}
