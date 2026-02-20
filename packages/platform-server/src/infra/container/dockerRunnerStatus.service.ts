import { Injectable, Optional } from '@nestjs/common';

import { ConfigService } from '../../core/services/config.service';

export type DockerRunnerStatus = 'unknown' | 'up' | 'down';

export type DockerRunnerStatusError = {
  code?: string;
  message: string;
  statusCode?: number;
};

export type DockerRunnerStatusSnapshot = {
  status: DockerRunnerStatus;
  baseUrl: string;
  optional: boolean;
  consecutiveFailures: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: DockerRunnerStatusError;
  nextRetryAt?: Date;
};

@Injectable()
export class DockerRunnerStatusService {
  private state: DockerRunnerStatusSnapshot;

  constructor(@Optional() private readonly config?: ConfigService) {
    const baseUrl = this.config?.getDockerRunnerBaseUrl?.() ?? 'unknown';
    const optional = this.config?.isDockerRunnerOptional?.() ?? true;
    this.state = {
      status: 'unknown',
      baseUrl,
      optional,
      consecutiveFailures: 0,
    };
  }

  getSnapshot(): DockerRunnerStatusSnapshot {
    return {
      ...this.state,
      lastSuccessAt: this.state.lastSuccessAt ? new Date(this.state.lastSuccessAt) : undefined,
      lastFailureAt: this.state.lastFailureAt ? new Date(this.state.lastFailureAt) : undefined,
      nextRetryAt: this.state.nextRetryAt ? new Date(this.state.nextRetryAt) : undefined,
      lastError: this.state.lastError ? { ...this.state.lastError } : undefined,
    };
  }

  setBaseUrl(baseUrl: string): void {
    if (!baseUrl) return;
    this.state = { ...this.state, baseUrl };
  }

  markUnknown(): void {
    this.state = { ...this.state, status: 'unknown' };
  }

  markSuccess(at: Date = new Date(), nextProbeAt?: Date): void {
    this.state = {
      ...this.state,
      status: 'up',
      lastSuccessAt: at,
      nextRetryAt: nextProbeAt,
      consecutiveFailures: 0,
    };
  }

  markFailure(error: DockerRunnerStatusError, consecutiveFailures: number, nextRetryAt?: Date, at: Date = new Date()): void {
    this.state = {
      ...this.state,
      status: 'down',
      lastFailureAt: at,
      lastError: error,
      nextRetryAt,
      consecutiveFailures,
    };
  }
}
