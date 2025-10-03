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
    platform: z
      .enum(['linux/amd64', 'linux/arm64'])
      .optional()
      .describe('Docker platform selector'),
    initialScript: z
      .string()
      .optional()
      .describe('Shell script (executed with /bin/sh -lc) to run immediately after creating the container.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

export class ContainerProviderEntity {
  private cfg?: Pick<ContainerOpts, 'image' | 'env' | 'platform'> & { initialScript?: string };

  constructor(
    private containerService: ContainerService,
    private opts: ContainerOpts,
    private idLabels: (id: string) => Record<string, string>,
  ) {}

  // Accept static configuration (image/env/initialScript). Validation performed via zod schema.
  setConfig(cfg: Record<string, unknown>): void {
    try {
      const parsed = ContainerProviderStaticConfigSchema.parse(cfg);
      this.cfg = parsed;
    } catch (e) {
      // If validation fails, surface a clearer error (caller can decide how to handle)
      throw new Error(`Invalid ContainerProvider configuration: ${(e as Error).message}`);
    }
  }

  async provide(threadId: string) {
    const labels = this.idLabels(threadId);
    const requestedPlatform = this.cfg?.platform ?? this.opts.platform;
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(labels);
    if (container) {
      // Enforce non-reuse if platform mismatches the requested one
      try {
        const docker = this.containerService.getDocker();
        const inspect = await docker.getContainer(container.id).inspect();
        const existingPlatform = inspect?.Config?.Labels?.['hautech.ai/platform'];
        if (requestedPlatform && existingPlatform !== requestedPlatform) {
          await container.stop(5);
          await container.remove(true);
          container = undefined;
        }
      } catch {
        container = undefined; // treat as invalid and create new
      }
    }
    if (!container) {
      container = await this.containerService.start({
        ...this.opts,
        // Only merge image/env/platform from cfg (initialScript is provider-level behavior, not a start option)
        image: this.cfg?.image ?? this.opts.image,
        env: { ...(this.opts.env || {}), ...(this.cfg?.env || {}) },
        platform: requestedPlatform,
        labels: { ...(this.opts.labels || {}), ...labels },
      });

      // Run initial script if provided. Treat non-zero exit code as failure.
      if (this.cfg?.initialScript) {
        const script = this.cfg.initialScript;
        const { exitCode, stderr } = await container.exec(script, { tty: false });
        if (exitCode !== 0) {
          throw new Error(
            `Initial script failed (exitCode=${exitCode}) for container ${container.id.substring(0, 12)}${
              stderr ? ` stderr: ${stderr}` : ''
            }`,
          );
        }
      }
    }
    return container;
  }
}
