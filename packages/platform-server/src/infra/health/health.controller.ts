import { Controller, Get } from '@nestjs/common';

import { DockerRunnerStatusService } from '../container/dockerRunnerStatus.service';

@Controller('health')
export class HealthController {
  constructor(private readonly dockerStatus: DockerRunnerStatusService) {}

  @Get()
  getHealth(): {
    status: string;
    timestamp: string;
    dependencies: {
      dockerRunner: {
        status: string;
        baseUrl: string;
        optional: boolean;
        consecutiveFailures: number;
        lastSuccessAt: string | null;
        lastFailureAt: string | null;
        nextRetryAt: string | null;
        lastError: {
          code?: string;
          message: string;
          statusCode?: number;
        } | null;
      };
    };
  } {
    const snapshot = this.dockerStatus.getSnapshot();
    const serializeDate = (value?: Date): string | null => (value ? value.toISOString() : null);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        dockerRunner: {
          status: snapshot.status,
          baseUrl: snapshot.baseUrl,
          optional: snapshot.optional,
          consecutiveFailures: snapshot.consecutiveFailures,
          lastSuccessAt: serializeDate(snapshot.lastSuccessAt),
          lastFailureAt: serializeDate(snapshot.lastFailureAt),
          nextRetryAt: serializeDate(snapshot.nextRetryAt),
          lastError: snapshot.lastError ?? null,
        },
      },
    };
  }
}
