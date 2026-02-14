import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContainerRegistry } from './container.registry';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';

@Injectable()
export class ContainerAdminService {
  private readonly logger = new Logger(ContainerAdminService.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly dockerClient: DockerClient,
    private readonly registry: ContainerRegistry,
  ) {}

  async deleteContainer(containerId: string): Promise<void> {
    await this.stopContainer(containerId);
    await this.removeContainer(containerId);
    await this.registry.markDeleted(containerId, 'manual_delete');
  }

  private async stopContainer(containerId: string): Promise<void> {
    try {
      await this.dockerClient.stopContainer(containerId, 10);
    } catch (error) {
      if (this.isBenignDockerError(error, [304, 404, 409])) {
        this.logger.debug('Stop container returned benign error', {
          containerId: this.shortId(containerId),
          errorCode: this.extractStatusCode(error),
        });
        return;
      }
      this.logger.error('Failed to stop container during delete', {
        containerId: this.shortId(containerId),
        error,
      });
      throw error;
    }
  }

  private async removeContainer(containerId: string): Promise<void> {
    try {
      await this.dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
    } catch (error) {
      if (this.isBenignDockerError(error, [404, 409])) {
        this.logger.debug('Remove container returned benign error', {
          containerId: this.shortId(containerId),
          errorCode: this.extractStatusCode(error),
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

  private isBenignDockerError(err: unknown, allowed: number[]): boolean {
    const code = this.extractStatusCode(err);
    return typeof code === 'number' && allowed.includes(code);
  }

  private extractStatusCode(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
      const value = (err as { statusCode?: unknown }).statusCode;
      if (typeof value === 'number') return value;
    }
    return undefined;
  }

  private shortId(containerId: string): string {
    return containerId.length > 12 ? containerId.slice(0, 12) : containerId;
  }
}
