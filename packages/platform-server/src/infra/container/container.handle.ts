import type { ContainerArchiveOptions, ContainerExecOptions, ContainerHandleDelegate } from './container.types';

/**
 * Lightweight entity wrapper representing a running (or created) container.
 * Provides convenience methods delegating to the configured container operations while binding the docker id.
 */
export class ContainerHandle {
  constructor(
    private readonly delegate: ContainerHandleDelegate,
    public readonly id: string,
  ) {}

  exec(
    command: string[] | string,
    options?: ContainerExecOptions,
  ) {
    return this.delegate.execContainer(this.id, command, options);
  }

  stop(timeoutSec = 10) {
    return this.delegate.stopContainer(this.id, timeoutSec);
  }
  remove(force = false) {
    return this.delegate.removeContainer(this.id, force);
  }

  /** Upload a tar archive into the container filesystem (defaults to /tmp). */
  putArchive(
    data: Buffer | NodeJS.ReadableStream,
    options: Partial<ContainerArchiveOptions> = { path: '/tmp' },
  ) {
    const path = options?.path || '/tmp';
    return this.delegate.putArchive(this.id, data, { path });
  }
}
