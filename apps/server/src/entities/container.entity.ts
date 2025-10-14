import { ContainerService } from '../services/container.service';

/**
 * Lightweight entity wrapper representing a running (or created) container.
 * Provides convenience methods delegating to ContainerService while binding the docker id.
 */
export class ContainerEntity {
  constructor(
    private service: ContainerService,
    public readonly id: string,
  ) {}

  exec(
    command: string[] | string,
    options?: { workdir?: string; env?: Record<string, string> | string[]; timeoutMs?: number; idleTimeoutMs?: number; killOnTimeout?: boolean; tty?: boolean },
  ) {
    return this.service.execContainer(this.id, command, options);
  }

  stop(timeoutSec = 10) {
    return this.service.stopContainer(this.id, timeoutSec);
  }
  remove(force = false) {
    return this.service.removeContainer(this.id, force);
  }
}
