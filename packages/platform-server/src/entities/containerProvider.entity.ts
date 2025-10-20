import { ContainerOpts, ContainerService } from '../services/container.service';
import { ContainerEntity } from './container.entity';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS } from '../constants.js';
import { VaultService } from '../services/vault.service';
import { ConfigService } from '../services/config.service';
import { NcpsKeyService } from '../services/ncpsKey.service';
import { EnvService, type EnvItem } from '../services/env.service';
import { LoggerService } from '../services/logger.service';

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
    // Optional Nix metadata (opaque to server; UI manages shape)
    nix: z.unknown().optional(),
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
    // Expose nix as opaque; builder custom UI component handles editing
    nix: z.unknown().optional(),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

export class ContainerProviderEntity {
  // Keep cfg loosely typed; normalize before use to ContainerOpts at boundaries
  private cfg?: ContainerProviderStaticConfig;
  // Local logger instance for concise, redact-safe logs (override in tests via setLogger)
  private logger = new LoggerService();

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
    private ncpsKeyService?: NcpsKeyService,
  ) {
    this.vaultService = vaultService;
    this.opts = opts || {};
    this.idLabels = idLabels;
    this.envService = new EnvService(vaultService);
  }

  // Allow tests to inject a mock logger
  setLogger(logger: LoggerService) {
    this.logger = logger || this.logger;
  }

  // Accept static configuration (image/env/initialScript). Validation performed via zod schema.
  setConfig(cfg: Record<string, unknown>): void {
    // Validation via Zod; nix is treated as opaque (no rejection of extended shapes)
    this.cfg = ContainerProviderStaticConfigSchema.parse(cfg);
  }

  async provide(threadId: string): Promise<ContainerEntity> {
    // Build base thread labels and workspace-specific labels
    const labels = this.idLabels(threadId);
    const workspaceLabels = { ...labels, 'hautech.ai/role': 'workspace' } as Record<string, string>;
    // Primary lookup: thread-scoped workspace container only
    // Debug note: ContainerService logs the exact filters as well.
    // Optional local debug:
    try {
      console.debug('[ContainerProviderEntity] lookup labels (workspace)', workspaceLabels);
    } catch {}
    let container: ContainerEntity | undefined = await this.containerService.findContainerByLabels(workspaceLabels);

    // Typed fallback: retry by thread_id only and exclude DinD sidecars.
    if (!container) container = await this.findFallbackNonDinD(labels);
    const enableDinD = this.cfg?.enableDinD ?? false;

    // Enforce non-reuse on platform mismatch if a platform is requested now
    const requestedPlatform = this.cfg?.platform ?? this.opts.platform;
    if (container && requestedPlatform) {
      const platformOk = await this.isPlatformReusable(container.id, requestedPlatform);
      if (!platformOk) {
        if (enableDinD) await this.stopAndRemoveDinD(labels, container.id);
        await this.safeStop(container);
        await this.safeRemove(container);
        container = undefined;
      }
    }

    if (!container) {
      const DOCKER_HOST_ENV = 'tcp://localhost:2375';
      const DOCKER_MIRROR_URL =
        this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      const enableDinD = this.cfg?.enableDinD ?? false;
      let envMerged: Record<string, string> | undefined = await (async () => {
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
      // Inject NIX_CONFIG only when not present and ncps is explicitly enabled and fully configured

      const hasNixConfig =
        !!envMerged && typeof envMerged === 'object' && 'NIX_CONFIG' in (envMerged as Record<string, string>);
      const ncpsEnabled = this.configService?.ncpsEnabled === true;
      const ncpsUrl = this.configService?.ncpsUrl;
      const keys = this.ncpsKeyService?.getKeysForInjection() || [];
      if (!hasNixConfig && ncpsEnabled && !!ncpsUrl && keys.length > 0) {
        const joined = keys.join(' ');
        const nixConfig = `substituters = ${ncpsUrl} https://cache.nixos.org\ntrusted-public-keys = ${joined} cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=`;
        envMerged = { ...(envMerged || {}), NIX_CONFIG: nixConfig } as Record<string, string>;
      }

      const normalizedEnv: Record<string, string> | undefined = envMerged;
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

      if (this.cfg?.initialScript) await this.runInitialScript(container, this.cfg.initialScript);

      // Intentional ordering: run initialScript first, then Nix install.
      // This lets the script prepare environment (e.g., user/profile) before installing packages.
      // Install Nix packages when resolved specs are provided (best-effort)
      try {
        const nixAny = this.cfg?.nix as any as { packages?: unknown } | undefined;
        const pkgsUnknown = nixAny && (nixAny as any).packages;
        const pkgsArr: unknown[] = Array.isArray(pkgsUnknown) ? (pkgsUnknown as unknown[]) : [];
        const specs = this.normalizeToInstallSpecs(pkgsArr);
        const originalCount = Array.isArray(pkgsUnknown) ? pkgsArr.length : 0;
        await this.ensureNixPackages(container, specs, originalCount);
      } catch (e) {
        // Do not fail startup on install errors; logs provide context
        this.logger.error('Nix install step failed (post-start)', e);
      }
    } else {
      const DOCKER_MIRROR_URL =
        this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      if (this.cfg?.enableDinD && container) await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
      // Also attempt install on reuse (idempotent)
      try {
        const nixAny = this.cfg?.nix as any as { packages?: unknown } | undefined;
        const pkgsUnknown = nixAny && (nixAny as any).packages;
        const pkgsArr: unknown[] = Array.isArray(pkgsUnknown) ? (pkgsUnknown as unknown[]) : [];
        const specs = this.normalizeToInstallSpecs(pkgsArr);
        const originalCount = Array.isArray(pkgsUnknown) ? pkgsArr.length : 0;
        await this.ensureNixPackages(container, specs, originalCount);
      } catch (e) {
        this.logger.error('Nix install step failed (reuse)', e);
      }
    }
    try {
      await this.containerService.touchLastUsed(container.id);
    } catch {}
    return container;
  }

  // Fallback: find any non-DinD container by thread labels
  private async findFallbackNonDinD(labels: Record<string, string>): Promise<ContainerEntity | undefined> {
    try { console.debug('[ContainerProviderEntity] fallback lookup by thread_id only', labels); } catch {}
    const candidates = await this.containerService.findContainersByLabels(labels);
    if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
    const results = await Promise.all(
      candidates.map(async (c) => {
        try { return { c, cl: await this.containerService.getContainerLabels(c.id) as Record<string, string> | undefined }; }
        catch { return { c, cl: undefined as Record<string, string> | undefined }; }
      }),
    );
    const picked = results.find(({ cl }) => cl?.['hautech.ai/role'] !== 'dind');
    return picked?.c;
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
        const { exitCode } = await this.containerService.execContainer(dind.id, [
          'sh',
          '-lc',
          'docker -H tcp://0.0.0.0:2375 info >/dev/null 2>&1',
        ]);
        if (exitCode === 0) return;
      } catch {}
      // Early fail if DinD exited unexpectedly (best-effort; skip if low-level client not available)
      await this.ensureDinDNotExited(dind);
      await sleep(1000);
    }
    throw new Error('DinD sidecar did not become ready within timeout');
  }

  private async ensureDinDNotExited(dind: ContainerEntity): Promise<void> {
    try {
      const maybeSvc: unknown = this.containerService;
      interface DockerLike { getContainer(id: string): { inspect(): Promise<unknown> } }
      interface DockerProvider { getDocker(): DockerLike }
      const hasGetDocker = typeof maybeSvc === 'object' && maybeSvc !== null && 'getDocker' in maybeSvc && typeof (maybeSvc as { getDocker?: unknown }).getDocker === 'function';
      if (!hasGetDocker) return;
      const docker = (maybeSvc as DockerProvider).getDocker();
      const inspect = (await docker.getContainer(dind.id).inspect()) as { State?: { Running?: boolean; Status?: string } };
      const state = inspect?.State;
      if (state && state.Running === false) throw new Error(`DinD sidecar exited unexpectedly: status=${state.Status}`);
    } catch (e) {
      throw e instanceof Error ? e : new Error('DinD sidecar exited unexpectedly');
    }
  }

  // ---------------------
  // Nix install helpers (class-private)
  // ---------------------

  // Coerce any accepted nix.packages array items to resolved install specs; ignore others
  // Note: this method intentionally avoids throwing; unknown shapes are skipped.
  private normalizeToInstallSpecs(items: unknown[]): NixInstallSpec[] {
    const specs: NixInstallSpec[] = [];
    for (const it of items || []) {
      if (!it || typeof it !== 'object') continue;
      const o = it as Record<string, unknown>;
      const ch = o['commitHash'];
      const ap = o['attributePath'];
      if (
        typeof ch === 'string' &&
        /^[0-9a-f]{40}$/.test(ch) &&
        typeof ap === 'string' &&
        /^[A-Za-z0-9_.+\-]+$/.test(ap) &&
        ap.length > 0
      ) {
        specs.push({ commitHash: ch, attributePath: ap });
      }
    }
    return specs;
  }

  // Install Nix packages in the container profile using combined install with per-package fallback
  private async ensureNixPackages(
    container: ContainerEntity,
    specs: NixInstallSpec[],
    originalCount: number,
  ): Promise<void> {
    try {
      if (!Array.isArray(specs) || specs.length === 0) {
        // If original config had entries but none were resolved, log once
        if ((originalCount || 0) > 0) {
          this.logger.info('nix.packages present but unresolved; skipping install');
        }
        return;
      }
      // Log when some items are ignored due to missing fields
      if ((originalCount || 0) > specs.length) {
        const ignored = (originalCount || 0) - specs.length;
        this.logger.info('%d nix.packages item(s) missing commitHash/attributePath; ignored', ignored);
      }
      // Detect Nix presence quickly
      const detect = await container.exec('command -v nix >/dev/null 2>&1 && nix --version', {
        timeoutMs: 5000,
        idleTimeoutMs: 0,
      });
      if (detect.exitCode !== 0) {
        this.logger.info('Nix not present; skipping install');
        return;
      }
      const refs = specs.map((s) => `github:NixOS/nixpkgs/${s.commitHash}#${s.attributePath}`);
      const PATH_PREFIX = 'export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"';
      const BASE =
        "nix profile install --accept-flake-config --extra-experimental-features 'nix-command flakes' --no-write-lock-file";
      const combined = `${PATH_PREFIX} && ${BASE} ${refs.join(' ')}`;
      this.logger.info('Nix install: %d packages (combined)', refs.length);
      const combinedRes = await container.exec(combined, { timeoutMs: 10 * 60_000, idleTimeoutMs: 60_000 });
      if (combinedRes.exitCode === 0) return;
      // Fallback per package
      this.logger.error('Nix install (combined) failed', { exitCode: combinedRes.exitCode });
      const cmdFor = (ref: string) => `${PATH_PREFIX} && ${BASE} ${ref}`;
      const timeoutOpts = { timeoutMs: 3 * 60_000, idleTimeoutMs: 60_000 } as const;
      await refs.reduce<Promise<void>>(
        (p, ref) =>
          p.then(async () => {
            const r = await container.exec(cmdFor(ref), timeoutOpts);
            if (r.exitCode === 0) this.logger.info('Nix install succeeded for %s', ref);
            else this.logger.error('Nix install failed for %s', ref, { exitCode: r.exitCode });
          }),
        Promise.resolve(),
      );
    } catch (e) {
      // Surface via logger; caller swallows to avoid failing startup
      this.logger.error('Nix install threw', e);
    }
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

export type NixInstallSpec = { commitHash: string; attributePath: string };

// ---- Private helpers to reduce nesting and keep behavior identical ----
export interface ContainerProviderEntity { // augment as declaration merging for private helpers
  // TS uses class fields; we attach methods below
}

// Determine whether existing container can be reused for requested platform
async function isPlatformReusable(this: ContainerProviderEntity, containerId: string, requestedPlatform: string): Promise<boolean> {
  try {
    // @ts-expect-error access private via this
    const containerLabels = await this.containerService.getContainerLabels(containerId);
    const existingPlatform = containerLabels?.[PLATFORM_LABEL];
    return !!existingPlatform && existingPlatform === requestedPlatform;
  } catch {
    return false;
  }
}

// Stop and remove DinD sidecars for a given parent container id
async function stopAndRemoveDinD(this: ContainerProviderEntity, labels: Record<string, string>, parentId: string): Promise<void> {
  try {
    // @ts-expect-error access private via this
    const dinds = await this.containerService.findContainersByLabels({
      ...labels,
      'hautech.ai/role': 'dind',
      'hautech.ai/parent_cid': parentId,
    });
    await Promise.all(
      dinds.map(async (d) => {
        try { await d.stop(5); } catch (e: unknown) { const sc = getStatusCode(e); if (sc !== 304 && sc !== 404 && sc !== 409) throw e; }
        try { await d.remove(true); } catch (e: unknown) { const sc = getStatusCode(e); if (sc !== 404 && sc !== 409) throw e; }
      }),
    );
  } catch {}
}

// Stop container safely
async function safeStop(this: ContainerProviderEntity, container: ContainerEntity): Promise<void> {
  try { await container.stop(); } catch (e: unknown) { const sc = getStatusCode(e); if (sc !== 304 && sc !== 404 && sc !== 409) throw e; }
}

// Remove container safely
async function safeRemove(this: ContainerProviderEntity, container: ContainerEntity): Promise<void> {
  try { await container.remove(true); } catch (e: unknown) { const sc = getStatusCode(e); if (sc !== 404 && sc !== 409) throw e; }
}

// Execute initial script and log error if it fails (previous behavior)
async function runInitialScript(this: ContainerProviderEntity, container: ContainerEntity, script: string): Promise<void> {
  const { exitCode, stderr } = await container.exec(script, { tty: false });
  // @ts-expect-error access private via this
  this.logger.error(`Initial script failed (exitCode=${exitCode}) for container ${container.id.substring(0, 12)}${stderr ? ` stderr: ${stderr}` : ''}`);
}

// Bind helpers to prototype (to keep method-like usage while reducing nesting inside class)
Object.assign(ContainerProviderEntity.prototype as any, {
  isPlatformReusable,
  stopAndRemoveDinD,
  safeStop,
  safeRemove,
  runInitialScript,
});
