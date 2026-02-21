import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { DockerRunnerRequestError } from './httpDockerRunner.client';
import { DockerRunnerStatusService } from './dockerRunnerStatus.service';

@Injectable()
export class DockerRunnerConnectivityMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DockerRunnerConnectivityMonitor.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private retriesExhausted = false;
  private failureCount = 0;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly statusService: DockerRunnerStatusService,
  ) {
    ConfigService.assertInitialized(configService);
  }

  async onModuleInit(): Promise<void> {
    const baseUrl = this.configService.getDockerRunnerBaseUrl();
    this.statusService.setBaseUrl(baseUrl);
    const optional = this.configService.getDockerRunnerOptional();
    this.statusService.setOptional(optional);
    this.logger.log(
      `Docker runner monitor initialized ${JSON.stringify({ baseUrl, optional })}`,
    );

    if (!optional) {
      await this.verifyRequiredRunner(baseUrl);
      this.scheduleProbe(this.configService.getDockerRunnerConnectProbeIntervalMs());
      return;
    }

    this.scheduleProbe(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async verifyRequiredRunner(baseUrl: string): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.dockerClient.checkConnectivity();
      const durationMs = Date.now() - startedAt;
      this.failureCount = 0;
      this.retriesExhausted = false;
      this.statusService.markUp({ checkedAt: startedAt, durationMs });
      this.logger.log(
        `Docker runner connectivity ok ${JSON.stringify({ dependency: 'docker-runner', baseUrl, durationMs })}`,
      );
    } catch (error) {
      this.statusService.markDown({ checkedAt: startedAt, error });
      const payload = this.buildErrorPayload({
        baseUrl,
        error,
        consecutiveFailures: 1,
      });
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Docker runner required connectivity failed ${JSON.stringify(payload)}`,
        stack,
      );
      throw error;
    }
  }

  private scheduleProbe(delayMs: number): void {
    if (this.stopped || this.retriesExhausted) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.runProbe();
    }, Math.max(delayMs, 0));
  }

  private async runProbe(): Promise<void> {
    if (this.stopped || this.retriesExhausted) {
      return;
    }

    const startedAt = Date.now();
    const baseUrl = this.configService.getDockerRunnerBaseUrl();

    try {
      await this.dockerClient.checkConnectivity();
      const durationMs = Date.now() - startedAt;
      this.failureCount = 0;
      this.retriesExhausted = false;
      this.statusService.markUp({ checkedAt: startedAt, durationMs });
      this.logger.log(
        `Docker runner connectivity ok ${JSON.stringify({ dependency: 'docker-runner', baseUrl, durationMs })}`,
      );
      this.scheduleProbe(this.configService.getDockerRunnerConnectProbeIntervalMs());
    } catch (error) {
      this.failureCount += 1;
      const maxRetries = this.configService.getDockerRunnerConnectMaxRetries();
      const exhausted = maxRetries > 0 && this.failureCount >= maxRetries;
      const retryDelay = exhausted ? undefined : this.calculateRetryDelay();
      const nextRetryAt = typeof retryDelay === 'number' ? Date.now() + retryDelay : undefined;

      this.statusService.markDown({ checkedAt: startedAt, error, nextRetryAt });
      const payload = this.buildErrorPayload({
        baseUrl,
        error,
        consecutiveFailures: this.failureCount,
        retryInMs: retryDelay,
        nextRetryAt,
      });
      const stack = error instanceof Error ? error.stack : undefined;

      if (exhausted) {
        this.retriesExhausted = true;
        this.logger.error(
          `Docker runner connectivity retries exhausted ${JSON.stringify(payload)}`,
          stack,
        );
        return;
      }

      this.logger.warn(
        `Docker runner connectivity failed ${JSON.stringify(payload)}`,
        stack,
      );
      if (typeof retryDelay === 'number') {
        this.scheduleProbe(retryDelay);
      }
    }
  }

  private calculateRetryDelay(): number {
    const baseDelay = this.configService.getDockerRunnerConnectRetryBaseDelayMs();
    const maxDelay = this.configService.getDockerRunnerConnectRetryMaxDelayMs();
    const jitter = this.configService.getDockerRunnerConnectRetryJitterMs();
    const exponent = Math.max(this.failureCount - 1, 0);
    const exponential = baseDelay * 2 ** exponent;
    const clamped = Math.min(exponential, maxDelay);
    const jitterValue = jitter > 0 ? Math.round(Math.random() * jitter) : 0;
    return clamped + jitterValue;
  }

  private buildErrorPayload(details: {
    baseUrl: string;
    error: unknown;
    consecutiveFailures: number;
    retryInMs?: number;
    nextRetryAt?: number;
  }): Record<string, unknown> {
    const { baseUrl, error, consecutiveFailures, retryInMs, nextRetryAt } = details;
    const code = error instanceof DockerRunnerRequestError ? error.errorCode : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return {
      dependency: 'docker-runner',
      baseUrl,
      errorCode: code,
      message,
      retryInMs,
      nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : undefined,
      consecutiveFailures,
    };
  }
}
