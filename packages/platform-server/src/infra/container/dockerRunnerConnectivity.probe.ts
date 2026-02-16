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

    try {
      const response = await this.dockerClient.checkConnectivity();
      this.logger.log('Docker runner connectivity established', { baseUrl, status: response.status });
    } catch (error) {
      const payload: Record<string, unknown> = { baseUrl };
      if (error instanceof DockerRunnerRequestError) {
        payload.statusCode = error.statusCode;
        payload.runnerErrorCode = error.errorCode;
        payload.retryable = error.retryable;
        payload.message = error.message;
      } else if (error instanceof Error) {
        payload.message = error.message;
      } else {
        payload.error = error;
      }
      this.logger.error('Docker runner connectivity check failed', error instanceof Error ? error.stack : undefined, payload);
      throw error;
    }
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
