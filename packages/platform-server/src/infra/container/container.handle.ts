import { ContainerService } from '../../infra/container/container.service';

/**
 * Lightweight entity wrapper representing a running (or created) container.
 * Provides convenience methods delegating to ContainerService while binding the docker id.
 */
export class ContainerHandle {
  constructor(
    private service: ContainerService,
    public readonly id: string,
  ) {}

  exec(
    command: string[] | string,
    options?: {
      workdir?: string;
      env?: Record<string, string> | string[];
      timeoutMs?: number;
      idleTimeoutMs?: number;
      killOnTimeout?: boolean;
      tty?: boolean;
      signal?: AbortSignal;
      onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
      logToPid1?: boolean;
    },
  ) {
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
