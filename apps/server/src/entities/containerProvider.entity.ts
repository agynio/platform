import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS, type Platform } from '../constants.js';
import { VaultService, type VaultRef } from '../services/vault.service';

// Static configuration schema for ContainerProviderEntity
// Allows overriding the base image and supplying environment variables.
export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z
      .record(z.string().min(1), z.string())
      .optional()
      .describe('Environment variables to inject into started containers.'),
    // UI hint: render env as key/value map and envRefs as a separate section.
    // Future iteration may unify with per-row source selector.
    envRefs: z
      .record(
        z.string().min(1),
        z
          .object({
            source: z.literal('vault').default('vault').describe('Secret source (Vault KV v2).'),
            mount: z.string().default('secret').describe('KV v2 mount name (e.g., secret)'),
            path: z.string().min(1).describe('Secret path under mount'),
            key: z.string().min(1).default('value').describe('Key within the secret object'),
            optional: z.boolean().optional().describe('If true, missing keys are ignored'),
          })
          .strict(),
      )
      .optional()
      .describe('Vault-backed environment variable references (server resolves at runtime).')
      .meta({ 'ui:field': 'VaultEnvRefs' }),
    initialScript: z
      .string()
      .optional()
      .describe('Shell script (executed with /bin/sh -lc) to run immediately after creating the container.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    platform: z
      .enum(SUPPORTED_PLATFORMS as [Platform, ...Platform[]])
      .optional()
      .describe('Docker platform selector for the workspace container')
      .meta({ 'ui:widget': 'select' }),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

export class ContainerProviderEntity {
  private cfg?: Pick<ContainerOpts, 'image' | 'env' | 'platform'> & {
    initialScript?: string;
    envRefs?: Record<string, { source: 'vault'; mount?: string; path: string; key?: string; optional?: boolean }>;
  };

  private vaultService: VaultService | undefined;
  private opts: ContainerOpts;
  private idLabels: (id: string) => Record<string, string>;

  // Backward-compatible constructor signatures:
  // - New: (containerService, vaultService, opts, idLabels)
  // - Old: (containerService, opts, idLabels)
  constructor(
    private containerService: ContainerService,
    vaultOrOpts: VaultService | ContainerOpts | undefined,
    optsOrId: ContainerOpts | ((id: string) => Record<string, string>),
    maybeId?: (id: string) => Record<string, string>,
  ) {
    if (typeof optsOrId === 'function') {
      // Old signature
      this.vaultService = undefined;
      this.opts = (vaultOrOpts as ContainerOpts) || {};
      this.idLabels = optsOrId;
    } else {
      // New signature
      this.vaultService = (vaultOrOpts as VaultService) || undefined;
      this.opts = (optsOrId as ContainerOpts) || {};
      this.idLabels = maybeId || ((id: string) => ({ 'hautech.ai/thread_id': id }));
    }
  }

  // Accept static configuration (image/env/initialScript). Validation performed via zod schema.
  setConfig(cfg: Record<string, unknown>): void {
    try {
      const parsed = ContainerProviderStaticConfigSchema.parse(cfg);
      this.cfg = parsed;
    } catch (e: unknown) {
      // If validation fails, surface a clearer error (caller can decide how to handle)
      const err = e as Error;
      throw new Error(`Invalid ContainerProvider configuration: ${err.message}`);
    }
  }

  async provide(threadId: string) {
    const labels = this.idLabels(threadId);
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(labels);

    // Enforce non-reuse on platform mismatch if a platform is requested now
    const requestedPlatform = this.cfg?.platform ?? this.opts.platform;
    if (container && requestedPlatform) {
      try {
        const containerLabels = await this.containerService.getContainerLabels(container.id);
        const existingPlatform = containerLabels?.[PLATFORM_LABEL];
        if (!existingPlatform || existingPlatform !== requestedPlatform) {
          // Stop and remove old container, then recreate (handle benign errors)
          try {
            await container.stop();
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 304 && sc !== 404) throw e;
          }
          try {
            await container.remove(true);
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 404) throw e;
          }
          container = undefined;
        }
      } catch {
        // If inspect fails, do not reuse to be safe; still attempt cleanup
        try {
          await container.stop();
        } catch {}
        try {
          await container.remove(true);
        } catch {}
        container = undefined;
      }
    }

    if (!container) {
      // Resolve env from envRefs via Vault (server-side only)
      let envMerged: Record<string, string> | undefined = { ...(this.opts.env || {}) } as Record<string, string>;
      if (this.cfg?.env) envMerged = { ...envMerged, ...this.cfg.env };
      const refs = this.cfg?.envRefs || {};
      if (refs && Object.keys(refs).length > 0) {
        if (!this.vaultService || !this.vaultService.isEnabled()) {
          throw new Error('Vault is not enabled but envRefs are configured');
        }
        for (const [varName, ref] of Object.entries(refs)) {
          const vr: VaultRef = {
            mount: (ref.mount || 'secret').replace(/\/$/, ''),
            path: ref.path,
            key: ref.key || 'value',
          };
          try {
            const value = await this.vaultService.getSecret(vr);
            if (value == null) {
              if (ref.optional) continue;
              throw new Error(`Missing Vault secret for ${varName} at ${vr.mount}/${vr.path}#${vr.key}`);
            }
            envMerged[varName] = String(value);
          } catch (e: unknown) {
            // Do not include secret values; only reference context
            throw new Error(`Vault resolution failed for ${varName} at ${vr.mount}/${vr.path}#${vr.key}: ${(e as Error).message}`);
          }
        }
      }

      container = await this.containerService.start({
        ...this.opts,
        // Only merge image/env from cfg (initialScript is provider-level behavior, not a start option)
        image: this.cfg?.image ?? this.opts.image,
        env: envMerged,
        labels: { ...(this.opts.labels || {}), ...labels },
        platform: requestedPlatform,
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

// Helper: safely read statusCode from unknown error values
function getStatusCode(e: unknown): number | undefined {
  if (typeof e === 'object' && e !== null && 'statusCode' in e) {
    const v = (e as { statusCode?: unknown }).statusCode;
    if (typeof v === 'number') return v;
  }
  return undefined;
}
