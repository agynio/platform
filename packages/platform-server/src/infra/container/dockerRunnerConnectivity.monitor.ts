import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '../../core/services/config.service';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { DockerRunnerRequestError } from './httpDockerRunner.client';
import {
  DockerRunnerStatusService,
  type DockerRunnerStatusError,
} from './dockerRunnerStatus.service';

type ConnectivityCapableClient = DockerClient & {
  checkConnectivity: () => Promise<unknown>;
  getBaseUrl?: () => string;
};

@Injectable()
export class DockerRunnerConnectivityMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DockerRunnerConnectivityMonitor.name);
  private stopRequested = false;
  private loopPromise?: Promise<void>;
  private currentDelay?: { timer: NodeJS.Timeout; resolve: () => void };
  private consecutiveFailures = 0;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    private readonly config: ConfigService,
    @Inject(DockerRunnerStatusService) private readonly status: DockerRunnerStatusService,
  ) {}

  async onModuleInit(): Promise<void> {
    const client = this.resolveConnectivityClient();
    if (!client) {
      this.logger.log('Docker runner connectivity monitor skipped (client lacks checkConnectivity)');
      return;
    }

    const baseUrl = this.resolveBaseUrl(client);
    this.status.setBaseUrl(baseUrl);

    if (!this.config.isDockerRunnerOptional()) {
      await this.verifyOrThrow(client);
    } else {
      this.status.markUnknown();
    }

    this.loopPromise = this.runLoop(client);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopRequested = true;
    if (this.currentDelay) {
      clearTimeout(this.currentDelay.timer);
      this.currentDelay.resolve();
      this.currentDelay = undefined;
    }
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private resolveConnectivityClient(): ConnectivityCapableClient | null {
    const candidate = this.dockerClient as Partial<ConnectivityCapableClient> | undefined;
    if (candidate && typeof candidate.checkConnectivity === 'function') {
      return candidate as ConnectivityCapableClient;
    }
    return null;
  }

  private resolveBaseUrl(client: ConnectivityCapableClient): string {
    if (typeof client.getBaseUrl === 'function') {
      try {
        return client.getBaseUrl();
      } catch {
        // ignore failures and fallback to config
      }
    }
    return this.config.getDockerRunnerBaseUrl();
  }

  private async verifyOrThrow(client: ConnectivityCapableClient): Promise<void> {
    try {
      await client.checkConnectivity();
      const now = new Date();
      this.consecutiveFailures = 0;
      this.status.markSuccess(now, this.computeNextProbeAt(now));
    } catch (error) {
      this.consecutiveFailures += 1;
      const failure = this.buildFailureDetails(error);
      this.status.markFailure(failure, this.consecutiveFailures);
      throw error;
    }
  }

  private async runLoop(client: ConnectivityCapableClient): Promise<void> {
    while (!this.stopRequested) {
      try {
        await client.checkConnectivity();
        const now = new Date();
        this.consecutiveFailures = 0;
        this.status.markSuccess(now, this.computeNextProbeAt(now));
        await this.wait(this.config.getDockerRunnerConnectProbeIntervalMs());
      } catch (error) {
        this.consecutiveFailures += 1;
        const retryDelay = this.calculateRetryDelay(this.consecutiveFailures);
        const nextRetryAt = new Date(Date.now() + retryDelay);
        const failure = this.buildFailureDetails(error);
        this.status.markFailure(failure, this.consecutiveFailures, nextRetryAt);

        this.logger.error(
          'Docker runner connectivity check failed',
          error instanceof Error ? error.stack : undefined,
          {
            dependency: 'docker-runner',
            baseUrl: this.status.getSnapshot().baseUrl,
            errorCode: failure.code ?? 'unknown_error',
            message: failure.message,
            retryInMs: retryDelay,
            nextRetryAt: nextRetryAt.toISOString(),
            consecutiveFailures: this.consecutiveFailures,
          },
        );

        if (this.hasExhaustedRetries()) {
          this.logger.error('Docker runner connectivity retries exhausted', {
            dependency: 'docker-runner',
            baseUrl: this.status.getSnapshot().baseUrl,
            consecutiveFailures: this.consecutiveFailures,
            maxRetries: this.config.getDockerRunnerConnectMaxRetries(),
          });
          return;
        }

        await this.wait(retryDelay);
      }
    }
  }

  private computeNextProbeAt(from: Date = new Date()): Date {
    const interval = this.config.getDockerRunnerConnectProbeIntervalMs();
    return new Date(from.getTime() + Math.max(0, interval));
  }

  private calculateRetryDelay(failureCount: number): number {
    const baseDelay = this.config.getDockerRunnerConnectRetryBaseDelayMs();
    const maxDelay = this.config.getDockerRunnerConnectRetryMaxDelayMs();
    const jitterMax = this.config.getDockerRunnerConnectRetryJitterMs();
    const exponential = baseDelay * Math.pow(2, Math.max(0, failureCount - 1));
    const capped = Math.min(maxDelay, Math.max(baseDelay, exponential));
    const jitter = jitterMax > 0 ? Math.floor(this.getRandom() * (jitterMax + 1)) : 0;
    return capped + jitter;
  }

  protected getRandom(): number {
    return Math.random();
  }

  private hasExhaustedRetries(): boolean {
    const maxRetries = this.config.getDockerRunnerConnectMaxRetries();
    return maxRetries > 0 && this.consecutiveFailures >= maxRetries;
  }

  private buildFailureDetails(error: unknown): DockerRunnerStatusError {
    if (error instanceof DockerRunnerRequestError) {
      return {
        code: error.errorCode ?? 'docker_runner_error',
        message: error.message,
        statusCode: error.statusCode,
      };
    }
    if (error instanceof Error) {
      return { code: 'unknown_error', message: error.message };
    }
    return { code: 'unknown_error', message: typeof error === 'string' ? error : 'unknown failure' };
  }

  private async wait(delayMs: number): Promise<void> {
    const delay = Math.max(0, delayMs);
    if (this.stopRequested || delay === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.currentDelay?.timer === timer) {
          this.currentDelay = undefined;
        }
        resolve();
      }, delay);
      this.currentDelay = { timer, resolve };
    });
  }
}
