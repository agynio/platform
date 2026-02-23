import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { DockerRunnerStatusService } from './dockerRunnerStatus.service';

@Injectable()
export class RequireDockerRunnerGuard implements CanActivate {
  constructor(@Optional() @Inject(DockerRunnerStatusService) private readonly statusService?: DockerRunnerStatusService) {}

  canActivate(_context: ExecutionContext): boolean {
    const snapshot = this.statusService?.getSnapshot();
    if (!snapshot) {
      return true;
    }
    if (snapshot.status === 'up') {
      return true;
    }

    throw new HttpException(
      {
        error: {
          code: 'docker_runner_not_ready',
          message: 'docker-runner not ready',
        },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
