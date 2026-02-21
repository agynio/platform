import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { DockerRunnerStatusService } from './dockerRunnerStatus.service';

@Injectable()
export class DockerRunnerConnectivityMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DockerRunnerConnectivityMonitor.name);
  private timer?: NodeJS.Timeout;
  private currentDelayMs: number;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    private readonly configService: ConfigService,
    private readonly statusService: DockerRunnerStatusService,
  ) {
    this.currentDelayMs = this.configService.getDockerRunnerConnectivityIntervalMs();
  }

  async onModuleInit(): Promise<void> {
    const baseUrl = this.configService.getDockerRunnerBaseUrl();
    this.statusService.setBaseUrl(baseUrl);
    this.statusService.setOptional(this.configService.getDockerRunnerOptional());
    this.logger.log(`Docker runner monitor initialized ${JSON.stringify({ baseUrl })}`);
    this.scheduleProbe(0);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleProbe(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.runProbe();
    }, delayMs);
  }

  private async runProbe(): Promise<void> {
    const startedAt = Date.now();
    const baseUrl = this.configService.getDockerRunnerBaseUrl();
    try {
      await this.dockerClient.checkConnectivity();
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Docker runner connectivity ok ${JSON.stringify({ baseUrl, durationMs })}`,
      );
      this.statusService.markUp({ checkedAt: startedAt, durationMs });
      this.currentDelayMs = this.configService.getDockerRunnerConnectivityIntervalMs();
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const retryDelay = this.calculateBackoffDelay();
      const payload = {
        baseUrl,
        durationMs,
        retryInMs: retryDelay,
      };
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.warn(
        `Docker runner connectivity failed ${JSON.stringify(payload)}`,
        trace,
      );
      this.statusService.markDown({
        checkedAt: startedAt,
        error,
        nextRetryAt: Date.now() + retryDelay,
      });
    } finally {
      this.scheduleProbe(this.currentDelayMs);
    }
  }

  private calculateBackoffDelay(): number {
    const maxDelay = this.configService.getDockerRunnerConnectivityMaxIntervalMs();
    const factor = this.configService.getDockerRunnerConnectivityBackoffFactor();
    const nextDelay = Math.min(Math.round(this.currentDelayMs * factor), maxDelay);
    this.currentDelayMs = nextDelay;
    return nextDelay;
  }
}
