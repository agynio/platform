import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';
import { DockerRunnerRequestError } from './httpDockerRunner.client';

export type DockerRunnerStatusState = 'unknown' | 'up' | 'down';

export type DockerRunnerStatusSnapshot = {
  status: DockerRunnerStatusState;
  optional: boolean;
  baseUrl?: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastDurationMs?: number;
  consecutiveFailures: number;
  nextRetryAt?: string;
  error?: {
    name?: string;
    message?: string;
    statusCode?: number;
    errorCode?: string;
    retryable?: boolean;
  };
};

@Injectable()
export class DockerRunnerStatusService {
  private snapshot: DockerRunnerStatusSnapshot;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    ConfigService.assertInitialized?.(this.configService);
    this.snapshot = {
      status: 'unknown',
      optional: this.configService.getDockerRunnerOptional(),
      baseUrl: this.configService.getDockerRunnerBaseUrl(),
      consecutiveFailures: 0,
    };
  }

  setBaseUrl(baseUrl: string): void {
    this.snapshot = { ...this.snapshot, baseUrl };
  }

  setOptional(optional: boolean): void {
    this.snapshot = { ...this.snapshot, optional };
  }

  markUnknown(): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'unknown',
      nextRetryAt: undefined,
    };
  }

  markUp(details: { checkedAt: number; durationMs: number }): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'up',
      lastCheckedAt: this.toIso(details.checkedAt),
      lastSuccessAt: this.toIso(Date.now()),
      lastDurationMs: details.durationMs,
      consecutiveFailures: 0,
      nextRetryAt: undefined,
      error: undefined,
    };
  }

  markDown(details: { checkedAt: number; error: unknown; nextRetryAt?: number }): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'down',
      lastCheckedAt: this.toIso(details.checkedAt),
      lastFailureAt: this.toIso(Date.now()),
      consecutiveFailures: this.snapshot.consecutiveFailures + 1,
      nextRetryAt: this.toIso(details.nextRetryAt),
      error: this.serializeError(details.error),
    };
  }

  getSnapshot(): DockerRunnerStatusSnapshot {
    const { error, ...rest } = this.snapshot;
    return {
      ...rest,
      error: error ? { ...error } : undefined,
    };
  }

  private toIso(timestamp: number | undefined): string | undefined {
    if (typeof timestamp !== 'number') return undefined;
    return new Date(timestamp).toISOString();
  }

  private serializeError(error: unknown): DockerRunnerStatusSnapshot['error'] | undefined {
    if (!error) return undefined;
    if (error instanceof DockerRunnerRequestError) {
      return {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        retryable: error.retryable,
      };
    }
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }
    return { message: String(error) };
  }
}
