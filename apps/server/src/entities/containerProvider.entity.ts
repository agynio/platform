import { ContainerOpts, ContainerService } from '../services/container.service';

import { ContainerEntity } from './container.entity';

export class ContainerProviderEntity {
  private cfg?: Pick<ContainerOpts, 'image' | 'env'>;

  constructor(
    private containerService: ContainerService,
    private opts: ContainerOpts,
    private idLabels: (id: string) => Record<string, string>,
  ) {}

  // No-op configurability to satisfy Configurable interface for graph registration
  setConfig(cfg: Record<string, unknown>): void {
    this.cfg = cfg as Pick<ContainerOpts, 'image' | 'env'>; // TODO: do proper parsing/validation with schema
  }

  async provide(threadId: string) {
    const labels = this.idLabels(threadId);
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(labels);
    if (!container) {
      container = await this.containerService.start({
        ...this.opts,
        ...this.cfg,
        env: { ...(this.opts.env || {}), ...(this.cfg?.env || {}) },
        labels: { ...(this.opts.labels || {}), ...labels },
      });
    }
    return container;
  }
}
