import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';

// Static configuration schema for ContainerProviderEntity
// Allows overriding the base image and supplying environment variables.
export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    platform: z
      .string()
      .min(1)
      .optional()
      .describe('Docker platform, e.g., linux/amd64 or linux/arm64'),
    env: z
      .record(z.string().min(1), z.string())
      .optional()
      .describe('Environment variables to inject into started containers.'),
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
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(labels);

    // If platform is requested in static config and an existing container is found, verify platform matches
    if (container && this.cfg?.platform) {
      try {
        const existingPlatform = await this.containerService.getContainerPlatform(container.id);
        if (existingPlatform && !this.isPlatformCompatible(this.cfg.platform, existingPlatform)) {
          // Do not reuse; create a new one
          const shortId = container.id.substring(0, 12);
          (this.containerService as any).logger?.debug?.(
            `Existing container platform mismatch: requested=${this.cfg.platform} found=${existingPlatform}. Skipping reuse for cid=${shortId}`,
          );
          container = undefined;
        }
      } catch (e) {
        // If we fail to determine platform, conservatively do not reuse when platform is explicitly requested
        const shortId = container.id.substring(0, 12);
        (this.containerService as any).logger?.debug?.(
          `Failed to determine existing container platform for cid=${shortId}: ${(e as Error).message}. Skipping reuse`,
        );
        container = undefined;
      }
    }

    if (!container) {
      container = await this.containerService.start({
        ...this.opts,
        // Only merge image/env from cfg (initialScript is provider-level behavior, not a start option)
        image: this.cfg?.image ?? this.opts.image,
        env: { ...(this.opts.env || {}), ...(this.cfg?.env || {}) },
        platform: this.cfg?.platform ?? this.opts.platform,
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

  // Platform detection lives in ContainerService for reuse; only normalization and comparison are kept here

  private normalizeArch(arch: string): string {
    // map common aliases
    if (arch === 'x86_64') return 'amd64';
    if (arch === 'aarch64') return 'arm64';
    if (arch === 'armhf') return 'arm';
    return arch || 'amd64';
  }

  private normalizeVariant(variant: string): string | undefined {
    if (!variant) return undefined;
    // Docker uses v7, v6, etc. Some metadata may be numeric
    if (variant === '8') return 'v8';
    if (variant === '7') return 'v7';
    if (variant === '6') return 'v6';
    if (variant === '5') return 'v5';
    return variant.startsWith('v') ? variant : `v${variant}`;
  }

  // Compare requested vs existing image platform
  private isPlatformCompatible(requested: string, existing: string): boolean {
    const parse = (p: string) => {
      const [os, arch, variant] = p.toLowerCase().split('/') as [string, string, string | undefined];
      return { os, arch: this.normalizeArch(arch), variant: this.normalizeVariant(variant || '') };
    };
    const req = parse(requested);
    const ex = parse(existing);
    if (req.os && ex.os && req.os !== ex.os) return false;
    if (req.arch && ex.arch && req.arch !== ex.arch) return false;
    if (req.arch === 'arm' || ex.arch === 'arm') {
      // For 32-bit ARM, match variants if both set
      if (req.variant && ex.variant && req.variant !== ex.variant) return false;
    } else if (req.arch === 'arm64' || ex.arch === 'arm64') {
      // ARM64: variant exists sometimes (e.g., v8) - ensure equality when both set
      if (req.variant && ex.variant && req.variant !== ex.variant) return false;
    }
    return true;
  }
}
