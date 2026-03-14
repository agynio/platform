import { Controller, Get, Header, Inject, Optional } from '@nestjs/common';
import { DockerRunnerStatusService, DockerRunnerStatusSnapshot } from '../container/dockerRunnerStatus.service';

type DegradedDockerRunnerCheck =
  | {
      status: 'skipped';
      optional: true;
      error?: { name?: string; message: string };
    }
  | {
      status: 'error';
      optional: true;
      error: { name?: string; message: string };
    };

type DockerRunnerCheck = DockerRunnerStatusSnapshot | DegradedDockerRunnerCheck;

@Controller()
export class HealthController {
  constructor(
    @Optional()
    @Inject(DockerRunnerStatusService)
    private readonly dockerRunnerStatus?: DockerRunnerStatusService,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  getHealth(): { status: 'ok'; timestamp: string; checks: { dockerRunner: DockerRunnerCheck } } {
    const dockerRunner = this.resolveDockerRunnerCheck();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        dockerRunner,
      },
    };
  }

  private resolveDockerRunnerCheck(): DockerRunnerCheck {
    if (!this.dockerRunnerStatus) {
      return {
        status: 'skipped',
        optional: true,
        error: {
          name: 'DependencyUnavailable',
          message: 'DockerRunnerStatusService not registered',
        },
      };
    }

    try {
      return this.dockerRunnerStatus.getSnapshot();
    } catch (error) {
      return {
        status: 'error',
        optional: true,
        error: HealthController.serializeError(error),
      };
    }
  }

  private static serializeError(error: unknown): { name?: string; message: string } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      name: 'Error',
      message: typeof error === 'string' ? error : String(error),
    };
  }
}
