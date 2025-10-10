import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS, type Platform } from '../constants.js';
import { VaultService, type VaultRef } from '../services/vault.service';
import { ConfigService } from '../services/config.service';
import { parseVaultRef } from '../utils/refs';

// Static configuration schema for ContainerProviderEntity
// Allows overriding the base image and supplying environment variables.
// New env item type with source-aware reference
const EnvItemSchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    source: z.enum(['static', 'vault']).optional().default('static'),
  })
  .strict()
  .describe('Environment variable entry. When source=vault, value is "<MOUNT>/<PATH>/<KEY>".');

// Internal schema: accepts both legacy and new shapes for compatibility
export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z.union([z.record(z.string().min(1), z.string()), z.array(EnvItemSchema)]).optional(),
    // Legacy envRefs kept for compatibility only
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
      .describe('Vault-backed environment variable references (server resolves at runtime).'),
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
    enableDinD: z
      .boolean()
      .default(false)
      .describe('Enable per-workspace Docker-in-Docker sidecar; defaults to disabled for tests/CI.'),
  })
  .strict();

// Exposed schema for UI/templates: advertise only the new env array
export const ContainerProviderExposedStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z
      .array(EnvItemSchema)
      .optional()
      .describe('Environment variables (static or vault references).')
      .meta({ 'ui:field': 'ReferenceEnvField' }),
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
    enableDinD: z
      .boolean()
      .default(false)
      .describe('Enable per-workspace Docker-in-Docker sidecar; defaults to disabled for tests/CI.'),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

type NewEnvItem = { key: string; value: string; source?: 'static' | 'vault' };
type LegacyEnvRefs = Record<string, { source: 'vault'; mount?: string; path: string; key?: string; optional?: boolean }>;

export class ContainerProviderEntity {
  private cfg?: Pick<ContainerOpts, 'image' | 'env' | 'platform'> & {
    env?: Record<string, string> | Array<NewEnvItem>;
    initialScript?: string;
    envRefs?: LegacyEnvRefs;
    enableDinD?: boolean;
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
    private configService?: ConfigService,
  ) {
    if (typeof optsOrId === 'function') {
      // Old signature: (containerService, opts, idLabels)
      this.vaultService = undefined;
      this.opts = (vaultOrOpts as ContainerOpts) || {};
      this.idLabels = optsOrId;
    } else {
      // New signature: (containerService, vaultService, opts, idLabels, configService?)
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
    const DOCKER_HOST_ENV = 'tcp://localhost:2375';
    const DOCKER_MIRROR_URL = this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
    const enableDinD = this.cfg?.enableDinD ?? false;

    // Enforce non-reuse on platform mismatch if a platform is requested now
    const requestedPlatform = this.cfg?.platform ?? this.opts.platform;
    if (container && requestedPlatform) {
      try {
        const containerLabels = await this.containerService.getContainerLabels(container.id);
        const existingPlatform = containerLabels?.[PLATFORM_LABEL];
        if (!existingPlatform || existingPlatform !== requestedPlatform) {
          // If DinD is enabled, remove associated DinD sidecar(s) first
          if (enableDinD) {
            try {
              const dinds = await this.containerService.findContainersByLabels({
                ...labels,
                'hautech.ai/role': 'dind',
                'hautech.ai/parent_cid': container.id,
              });
              // Stop/remove DinD sidecars concurrently
              await Promise.all(
                dinds.map(async (d) => {
                  try {
                    await d.stop(5);
                  } catch {}
                  try {
                    await d.remove(true);
                  } catch {}
                }),
              );
            } catch {}
          }
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
      // Resolve env with preference to new array form; fallback to legacy env + envRefs
      let envMerged: Record<string, string> | undefined = { ...(this.opts.env || {}) } as Record<string, string>;

      const cfgEnv = this.cfg?.env as unknown;
      if (Array.isArray(cfgEnv)) {
        const seen = new Set<string>();
        const vaultLookups: Array<{ k: string; ref: VaultRef }> = [];
        const staticPairs: Array<{ k: string; v: string }> = [];
        for (const item of cfgEnv as Array<{ key?: string; value?: string; source?: 'static'|'vault' }>) {
          const key = item?.key?.trim();
          const value = item?.value ?? '';
          const source = (item?.source || 'static');
          if (!key) throw new Error('env entries require non-empty key');
          if (seen.has(key)) throw new Error(`Duplicate env key: ${key}`);
          seen.add(key);
          if (source === 'vault') {
            if (!this.vaultService || !this.vaultService.isEnabled()) {
              throw new Error('Vault is not enabled but env contains vault-sourced entries');
            }
            const vr = parseVaultRef(value);
            vaultLookups.push({ k: key, ref: vr });
          } else {
            staticPairs.push({ k: key, v: value });
          }
        }
        // Apply static pairs immediately
        for (const { k, v } of staticPairs) envMerged[k] = v;
        // Resolve all vault refs concurrently
        const resolved = await Promise.all(
          vaultLookups.map(async ({ k, ref }) => {
            try {
              const v = await this.vaultService!.getSecret(ref);
              if (v == null) throw new Error(`Missing Vault secret at ${ref.mount}/${ref.path}#${ref.key}`);
              return { k, v: String(v) };
            } catch (e) {
              throw new Error(`Vault resolution failed for ${k} at ${ref.mount}/${ref.path}#${ref.key}: ${(e as Error).message}`);
            }
          }),
        );
        for (const { k, v } of resolved) envMerged[k] = v;
      } else {
        // Legacy: plain env map
        if (this.cfg?.env && typeof this.cfg.env === 'object') {
          envMerged = { ...envMerged, ...(this.cfg.env as Record<string, string>) };
        }
        // Legacy: envRefs
        const refs = this.cfg?.envRefs || {};
        if (refs && Object.keys(refs).length > 0) {
          if (!this.vaultService || !this.vaultService.isEnabled()) {
            throw new Error('Vault is not enabled but envRefs are configured');
          }
          const entries = Object.entries(refs);
          const results = await Promise.all(
            entries.map(async ([varName, ref]) => {
              const vr: VaultRef = {
                mount: (ref.mount || 'secret').replace(/\/$/, ''),
                path: ref.path,
                key: ref.key || 'value',
              };
              try {
                const value = await this.vaultService!.getSecret(vr);
                if (value == null) {
                  if (ref.optional) return { varName, skip: true as const };
                  throw new Error(`Missing Vault secret for ${varName} at ${vr.mount}/${vr.path}#${vr.key}`);
                }
                return { varName, value: String(value) };
              } catch (e) {
                throw new Error(`Vault resolution failed for ${varName} at ${vr.mount}/${vr.path}#${vr.key}: ${(e as Error).message}`);
              }
            }),
          );
          for (const r of results) if ('value' in r) envMerged[r.varName] = r.value;
        }
      }

      container = await this.containerService.start({
        ...this.opts,
        // Only merge image/env from cfg (initialScript is provider-level behavior, not a start option)
        image: this.cfg?.image ?? this.opts.image,
        env: enableDinD ? { ...(envMerged || {}), DOCKER_HOST: DOCKER_HOST_ENV } : envMerged,
        labels: { ...(this.opts.labels || {}), ...labels },
        platform: requestedPlatform,
      });

      // Create per-workspace DinD sidecar attached to the workspace network namespace (only when enabled)
      if (enableDinD) {
        await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
      }

      // Run initial script after DinD readiness. Treat non-zero exit code as failure.
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
    } else {
      // Reuse path: ensure DinD exists and is healthy (only when enabled)
      if (enableDinD) {
        await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
      }
    }
    return container;
  }

  private async ensureDinD(workspace: ContainerEntity, baseLabels: Record<string, string>, mirrorUrl: string) {
    // Check existing
    let dind = await this.containerService.findContainerByLabels({
      ...baseLabels,
      'hautech.ai/role': 'dind',
      'hautech.ai/parent_cid': workspace.id,
    });

    if (!dind) {
      // Start DinD with shared network namespace
      const dindLabels = { ...baseLabels, 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': workspace.id };
      dind = await this.containerService.start({
        image: 'docker:27-dind',
        env: { DOCKER_TLS_CERTDIR: '' },
        cmd: ['-H', 'tcp://0.0.0.0:2375', '--registry-mirror', mirrorUrl],
        labels: dindLabels,
        autoRemove: true,
        privileged: true,
        networkMode: `container:${workspace.id}`,
        anonymousVolumes: ['/var/lib/docker'],
      });
    }

    // Readiness: poll docker info within dind container
    await this.waitForDinDReady(dind);
  }

  private async waitForDinDReady(dind: ContainerEntity) {
    const deadline = Date.now() + 60_000; // 60s timeout
    // Helper sleep
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (Date.now() < deadline) {
      try {
        const { exitCode } = await this.containerService.execContainer(dind.id, ['sh', '-lc', 'docker -H tcp://0.0.0.0:2375 info >/dev/null 2>&1']);
        if (exitCode === 0) return;
      } catch {}
      // Early fail if DinD exited unexpectedly (best-effort; skip if low-level client not available)
      try {
        const maybeSvc: unknown = this.containerService;
        // Narrow to objects that expose getDocker(): Docker
        const hasGetDocker =
          typeof maybeSvc === 'object' && maybeSvc !== null && 'getDocker' in maybeSvc &&
          typeof (maybeSvc as { getDocker?: unknown }).getDocker === 'function';
        if (hasGetDocker) {
          const docker = (maybeSvc as { getDocker: () => import('dockerode').default }).getDocker();
          const inspect = await docker.getContainer(dind.id).inspect();
          const state = inspect?.State as { Running?: boolean; Status?: string } | undefined;
          if (state && state.Running === false) {
            throw new Error(`DinD sidecar exited unexpectedly: status=${state.Status}`);
          }
        }
      } catch (e) {
        // If inspect reports not running or other error, fail fast
        throw e instanceof Error ? e : new Error('DinD sidecar exited unexpectedly');
      }
      await sleep(1000);
    }
    throw new Error('DinD sidecar did not become ready within timeout');
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

// Parse Vault reference string in format "mount/path/key" with path supporting nested segments.
// Returns VaultRef and throws on invalid inputs.
// parseVaultRef now imported from ../utils/refs
