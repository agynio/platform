import { Controller, Get } from '@nestjs/common';
import { DockerRunnerStatusService } from '../container/dockerRunnerStatus.service';

@Controller()
export class HealthController {
  constructor(private readonly dockerRunnerStatus: DockerRunnerStatusService) {}

  @Get('health')
  getHealth() {
    const dockerRunner = this.dockerRunnerStatus?.getSnapshot?.() ?? {
      status: 'unknown',
      optional: true,
      consecutiveFailures: 0,
    };

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        dockerRunner,
      },
    };
  }
}
