import { setTimeout as delay } from 'node:timers/promises';

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '../../core/services/config.service';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { DockerRunnerRequestError, HttpDockerRunnerClient } from './httpDockerRunner.client';

@Injectable()
export class DockerRunnerConnectivityProbe implements OnModuleInit {
  private readonly logger = new Logger(DockerRunnerConnectivityProbe.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    private readonly config?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = this.resolveConfig();
    if (!config) {
      this.logger.log('Skipping docker runner connectivity probe (config unavailable)');
      return;
    }
    const baseUrl = config.getDockerRunnerBaseUrl();
    if (process.env.SKIP_DOCKER_RUNNER_PROBE === '1') {
      this.logger.log('Skipping docker runner connectivity probe (explicit skip)', { baseUrl });
      return;
    }
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_DOCKER_RUNNER_PROBE !== '1') {
      this.logger.log('Skipping docker runner connectivity probe in test environment', { baseUrl });
      return;
    }
    if (!(this.dockerClient instanceof HttpDockerRunnerClient)) {
      this.logger.log('Skipping docker runner connectivity probe (non-HTTP client)', { baseUrl });
      return;
    }

    await this.probe(baseUrl, this.dockerClient);
  }

  private async probe(baseUrl: string, client: HttpDockerRunnerClient): Promise<void> {
    const maxAttempts = this.parsePositiveInt(
      process.env.DOCKER_RUNNER_PROBE_MAX_ATTEMPTS,
      30,
    );
    const intervalMs = this.parsePositiveInt(
      process.env.DOCKER_RUNNER_PROBE_INTERVAL_MS,
      2_000,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await client.checkConnectivity();
        this.logger.log('Docker runner connectivity established', {
          baseUrl,
          status: response.status,
          attempt,
        });
        return;
      } catch (error: unknown) {
        const payload = this.buildErrorPayload(baseUrl, error);
        payload.attempt = attempt;
        payload.maxAttempts = maxAttempts;
        if (!Object.prototype.hasOwnProperty.call(payload, 'retryable')) {
          payload.retryable = this.isRetryable(error);
        }

        const shouldRetry = payload.retryable && attempt < maxAttempts;
        if (!shouldRetry) {
          this.logger.error(
            'Docker runner connectivity check failed',
            error instanceof Error ? error.stack : undefined,
            payload,
          );
          throw error instanceof Error ? error : new Error('docker_runner_connectivity_failed');
        }

        this.logger.warn('Docker runner connectivity not ready; retrying', payload);
        await delay(intervalMs);
      }
    }
  }

  private buildErrorPayload(baseUrl: string, error: unknown): Record<string, unknown> {
    const payload: Record<string, unknown> = { baseUrl };
    if (error instanceof DockerRunnerRequestError) {
      payload.statusCode = error.statusCode;
      payload.runnerErrorCode = error.errorCode;
      payload.retryable = error.retryable;
      payload.message = error.message;
      return payload;
    }
    if (error instanceof Error) {
      payload.message = error.message;
      return payload;
    }
    payload.error = error;
    return payload;
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof DockerRunnerRequestError) {
      return error.retryable;
    }
    return true;
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private resolveConfig(): ConfigService | undefined {
    if (this.config) {
      return this.config;
    }
    if (ConfigService.isRegistered()) {
      return ConfigService.getInstance();
    }
    return undefined;
  }
}
