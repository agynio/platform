import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';

// Static configuration schema for ContainerProviderEntity
// Allows overriding the base image and supplying environment variables.
export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z
      .record(z.string().min(1), z.string())
      .optional()
      .describe('Environment variables to inject into started containers.'),
  })
  .strict();

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
