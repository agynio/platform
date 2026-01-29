import type { DockerClientPort } from './dockerClient.port';
import type { ExecOptions } from './types';

/**
 * Lightweight entity wrapper representing a running (or created) container.
 * Provides convenience methods delegating to ContainerService while binding the docker id.
 */
export class ContainerHandle {
  constructor(
    private readonly service: DockerClientPort,
    public readonly id: string,
  ) {}

  exec(command: string[] | string, options?: ExecOptions) {
    return this.service.execContainer(this.id, command, options);
  }

  stop(timeoutSec = 10) {
    return this.service.stopContainer(this.id, timeoutSec);
  }
  remove(options?: boolean | { force?: boolean; removeVolumes?: boolean }) {
    return this.service.removeContainer(this.id, options);
  }

  /** Upload a tar archive into the container filesystem (defaults to /tmp). */
  putArchive(data: Buffer | NodeJS.ReadableStream, options: { path?: string } = { path: '/tmp' }) {
    const path = options?.path || '/tmp';
    return this.service.putArchive(this.id, data, { path });
  }
}
