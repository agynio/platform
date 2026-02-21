import { Controller, Get } from '@nestjs/common';
import { DockerRunnerStatusService } from '../container/dockerRunnerStatus.service';

@Controller()
export class HealthController {
  constructor(private readonly dockerRunnerStatus: DockerRunnerStatusService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        dockerRunner: this.dockerRunnerStatus.getSnapshot(),
      },
    };
  }
}
