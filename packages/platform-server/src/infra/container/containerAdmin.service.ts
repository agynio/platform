import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContainerRegistry } from './container.registry';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';

type StopContainerOptions = {
  swallowNonBenignErrors?: boolean;
};

@Injectable()
export class ContainerAdminService {
  private readonly logger = new Logger(ContainerAdminService.name);
  private static readonly MISSING_CONTAINER_ERROR_CODES: ReadonlyArray<string> = [
    'container_not_found',
    'container_not_running',
    'container_not_stopped',
    'no_such_container',
    'not_found',
  ];

  private static readonly MISSING_CONTAINER_MESSAGE_PATTERNS: ReadonlyArray<RegExp> = [
    /no such container/i,
    /container (is|was)? not found/i,
  ];

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    private readonly registry: ContainerRegistry,
  ) {}

  async deleteContainer(containerId: string): Promise<void> {
    const context = { containerId: this.shortId(containerId) };
    this.logger.log('Deleting container', context);
    await this.stopContainer(containerId, { swallowNonBenignErrors: true });
    await this.removeContainer(containerId);
    await this.registry.markDeleted(containerId, 'manual_delete');
    this.logger.debug('Container registry marked deleted', context);
  }

  private async stopContainer(containerId: string, options?: StopContainerOptions): Promise<void> {
    const context = { containerId: this.shortId(containerId), timeoutSec: 10 };
    this.logger.debug('Stopping container before delete', context);
    try {
      await this.dockerClient.stopContainer(containerId, 10);
      this.logger.debug('Stop container completed', context);
    } catch (error) {
      if (this.isBenignDockerError(error, [304, 404, 409], ContainerAdminService.MISSING_CONTAINER_ERROR_CODES)) {
        this.logger.debug('Stop container returned benign error', {
          containerId: this.shortId(containerId),
          statusCode: this.extractStatusCode(error),
          errorCode: this.extractErrorCode(error),
        });
        return;
      }
      const context = {
        containerId: this.shortId(containerId),
        statusCode: this.extractStatusCode(error),
        errorCode: this.extractErrorCode(error),
        error,
      };
      if (options?.swallowNonBenignErrors) {
        this.logger.warn('Failed to stop container before delete; continuing with forced removal', context);
        return;
      }
      this.logger.error('Failed to stop container during delete', context);
      throw error;
    }
  }

  private async removeContainer(containerId: string): Promise<void> {
    const context = { containerId: this.shortId(containerId) };
    this.logger.debug('Removing container with force', context);
    try {
      await this.dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      this.logger.debug('Force removal completed', context);
    } catch (error) {
      if (this.isBenignDockerError(error, [404, 409], ContainerAdminService.MISSING_CONTAINER_ERROR_CODES)) {
        this.logger.debug('Remove container returned benign error', {
          containerId: this.shortId(containerId),
          statusCode: this.extractStatusCode(error),
          errorCode: this.extractErrorCode(error),
        });
        return;
      }
      this.logger.error('Failed to remove container during delete', {
        containerId: this.shortId(containerId),
        error,
      });
      throw error;
    }
  }

  private isBenignDockerError(err: unknown, allowedStatuses: number[], allowedErrorCodes: ReadonlyArray<string> = []): boolean {
    const statusCode = this.extractStatusCode(err);
    if (typeof statusCode === 'number' && allowedStatuses.includes(statusCode)) {
      return true;
    }
    const errorCode = this.extractErrorCode(err);
    if (typeof errorCode === 'string' && allowedErrorCodes.includes(errorCode)) {
      return true;
    }
    const message = this.extractErrorMessage(err);
    if (message && ContainerAdminService.MISSING_CONTAINER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
      return true;
    }
    return false;
  }

  private extractStatusCode(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
      const value = (err as { statusCode?: unknown }).statusCode;
      if (typeof value === 'number') return value;
    }
    return undefined;
  }

  private extractErrorCode(err: unknown): string | undefined {
    if (typeof err === 'object' && err !== null && 'errorCode' in err) {
      const value = (err as { errorCode?: unknown }).errorCode;
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
    }
    if (typeof err === 'object' && err !== null && 'code' in err) {
      const value = (err as { code?: unknown }).code;
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  private extractErrorMessage(err: unknown): string | undefined {
    if (typeof err === 'string') {
      return err;
    }
    if (err instanceof Error && typeof err.message === 'string') {
      return err.message;
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const value = (err as { message?: unknown }).message;
      if (typeof value === 'string') {
        return value;
      }
    }
    return undefined;
  }

  private shortId(containerId: string): string {
    return containerId.length > 12 ? containerId.slice(0, 12) : containerId;
  }
}
