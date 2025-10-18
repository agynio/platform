import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS, type Platform } from '../constants.js';
import { VaultService } from '../services/vault.service';
import { ConfigService } from '../services/config.service';
import { EnvService, type EnvItem } from '../services/env.service';

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

// Internal schema (legacy envRefs removed)
export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z.union([z.record(z.string().min(1), z.string()), z.array(EnvItemSchema)]).optional(),
    initialScript: z
      .string()
      .optional()
      .describe('Shell script (executed with /bin/sh -lc) to run immediately after creating the container.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    platform: z
      .enum(SUPPORTED_PLATFORMS)
      .optional()
      .describe('Docker platform selector for the workspace container')
      .meta({ 'ui:widget': 'select' }),
    enableDinD: z
      .boolean()
      .default(false)
      .describe('Enable per-workspace Docker-in-Docker sidecar; defaults to disabled for tests/CI.'),
    ttlSeconds: z
      .number()
      .int()
      .default(86400)
      .describe('Idle TTL (seconds) before workspace cleanup; <=0 disables cleanup.'),
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
      .enum(SUPPORTED_PLATFORMS)
      .optional()
      .describe('Docker platform selector for the workspace container')
      .meta({ 'ui:widget': 'select' }),
    enableDinD: z
      .boolean()
      .default(false)
      .describe('Enable per-workspace Docker-in-Docker sidecar; defaults to disabled for tests/CI.'),
    ttlSeconds: z
      .number()
      .int()
      .default(86400)
      .describe('Idle TTL (seconds) before workspace cleanup; <=0 disables cleanup.'),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

type NewEnvItem = EnvItem;

export class ContainerProviderEntity {
  // Keep cfg loosely typed; normalize before use to ContainerOpts at boundaries
  private cfg?: {
    image?: ContainerOpts['image'];
    env?: Record<string, string> | Array<NewEnvItem>;
    platform?: ContainerOpts['platform'];
    initialScript?: string;
    enableDinD?: boolean;
    ttlSeconds?: number;
  };

  private vaultService: VaultService | undefined;
  private opts: ContainerOpts;
  private idLabels: (id: string) => Record<string, string>;

  private envService: EnvService;
  // New constructor only
  constructor(
    private containerService: ContainerService,
    vaultService: VaultService | undefined,
    opts: ContainerOpts,
    idLabels: (id: string) => Record<string, string>,
    private configService?: ConfigService,
  ) {
    this.vaultService = vaultService;
    this.opts = opts || {};
    this.idLabels = idLabels;
    this.envService = new EnvService(vaultService);
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
    // Build base thread labels and workspace-specific labels
    const labels = this.idLabels(threadId);
    const workspaceLabels = { ...labels, 'hautech.ai/role': 'workspace' } as Record<string, string>;
    // Primary lookup: thread-scoped workspace container only
    // Debug note: ContainerService logs the exact filters as well.
    // Optional local debug:
    try { console.debug('[ContainerProviderEntity] lookup labels (workspace)', workspaceLabels); } catch {}
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(workspaceLabels);

    // Back-compat safe fallback: if no labeled workspace found, retry by thread_id only
    // and exclude any DinD sidecars by inspecting labels before reuse.
    if (!container) {
      try { console.debug('[ContainerProviderEntity] fallback lookup by thread_id only', labels); } catch {}
      const candidates = await this.containerService.findContainersByLabels(labels);
      // Fetch candidate labels in parallel, then iterate in original order to preserve selection semantics
      const labelPromises = candidates.map((c) =>
        this.containerService
          .getContainerLabels(c.id)
          .then((cl) => ({ c, cl }))
          .catch(() => ({ c, cl: undefined as Record<string, string> | undefined })),
      );
      const results = await Promise.all(labelPromises);
      for (const { c, cl } of results) {
        // Skip DinD sidecars; allow unlabeled legacy workspaces
        if (cl?.['hautech.ai/role'] === 'dind') continue;
        container = c;
        break;
      }
    }
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
                  } catch (e: unknown) {
                    const sc = getStatusCode(e);
                    // benign: already stopped/removed-in-progress
                    if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
                  }
                  try {
                    await d.remove(true);
                  } catch (e: unknown) {
                    const sc = getStatusCode(e);
                    // benign: already removed / removal-in-progress
                    if (sc !== 404 && sc !== 409) throw e;
                  }
                }),
              );
            } catch {}
          }
          // Stop and remove old container, then recreate (handle benign errors)
          try {
            await (container as ContainerEntity).stop();
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
          }
          try {
            await (container as ContainerEntity).remove(true);
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 404 && sc !== 409) throw e;
          }
          container = undefined;
        }
      } catch {
        // If inspect fails, do not reuse to be safe; still attempt cleanup
        try {
          await (container as ContainerEntity).stop();
        } catch (e: unknown) {
          const sc = getStatusCode(e);
          if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
        }
        try {
          await (container as ContainerEntity).remove(true);
        } catch (e: unknown) {
          const sc = getStatusCode(e);
          if (sc !== 404 && sc !== 409) throw e;
        }
        container = undefined;
      }
    }

    if (!container) {
      const DOCKER_HOST_ENV = 'tcp://localhost:2375';
      const DOCKER_MIRROR_URL = this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      const enableDinD = this.cfg?.enableDinD ?? false;
      const envMerged = await (async () => {
        const base: Record<string, string> = Array.isArray(this.opts.env)
          ? Object.fromEntries(
              (this.opts.env || [])
                .map((s) => String(s))
                .map((pair) => {
                  const idx = pair.indexOf('=');
                  return idx > -1 ? [pair.slice(0, idx), pair.slice(idx + 1)] : [pair, ''];
                }),
            )
          : (this.opts.env as Record<string, string>) || {};
        const cfgEnv = this.cfg?.env as Record<string, string> | EnvItem[] | undefined;
        return this.envService.resolveProviderEnv(cfgEnv, undefined, base);
      })();
      const normalizedEnv = envMerged as Record<string, string> | undefined;
      container = await this.containerService.start({
        ...this.opts,
        image: this.cfg?.image ?? this.opts.image,
        // Ensure env is in a format ContainerService understands (Record or string[]). envService returns Record.
        env: enableDinD ? { ...(normalizedEnv || {}), DOCKER_HOST: DOCKER_HOST_ENV } : normalizedEnv,
        labels: { ...(this.opts.labels || {}), ...workspaceLabels },
        platform: requestedPlatform,
        ttlSeconds: this.cfg?.ttlSeconds ?? 86400,
      });
      if (enableDinD) await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
      if (this.cfg?.initialScript) {
        const script = this.cfg.initialScript;
        const { exitCode, stderr } = await container.exec(script, { tty: false });
        if (exitCode !== 0) {
          throw new Error(
            `Initial script failed (exitCode=${exitCode}) for container ${container.id.substring(0, 12)}${stderr ? ` stderr: ${stderr}` : ''}`,
          );
        }
      }
    } else {
      const DOCKER_MIRROR_URL = this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      if (this.cfg?.enableDinD && container) await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
    }
    try { await this.containerService.touchLastUsed(container.id); } catch {}
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
        // Minimal interfaces to avoid any-casts
        interface DockerLike { getContainer(id: string): { inspect(): Promise<unknown> } }
        interface DockerProvider { getDocker(): DockerLike }
        const hasGetDocker =
          typeof maybeSvc === 'object' && maybeSvc !== null && 'getDocker' in maybeSvc &&
          typeof (maybeSvc as { getDocker?: unknown }).getDocker === 'function';
        if (hasGetDocker) {
          const docker = (maybeSvc as DockerProvider).getDocker();
          const inspect = (await docker.getContainer(dind.id).inspect()) as { State?: { Running?: boolean; Status?: string } };
          const state = inspect?.State;
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
