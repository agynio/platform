import { ContainerOpts, ContainerService } from "../services/container.service";
import { ContainerEntity } from "./container.entity";

export class ContainerProviderEntity {
  constructor(
    private containerService: ContainerService,
    private opts: ContainerOpts,
    private idLabels: (id: string) => Record<string, string>,
  ) {}

  async provide(threadId: string) {
    const labels = this.idLabels(threadId);
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(labels);
    if (!container) {
      container = await this.containerService.start({
        ...this.opts,
        labels: { ...(this.opts.labels || {}), ...labels },
      });
    }
    return container;
  }
}
