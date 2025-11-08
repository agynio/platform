import { ContainerOpts, ContainerService } from '../../../infra/container/container.service';
import Node from '../base/Node';
import { ContainerHandle } from '../../../infra/container/container.handle';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS } from '../../../constants';
import { ConfigService } from '../../../core/services/config.service';
import { NcpsKeyService } from '../../../infra/ncps/ncpsKey.service';
import { EnvService, type EnvItem } from '../../../env/env.service';
import { LoggerService } from '../../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';

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
    env: z.array(EnvItemSchema).optional().describe('Environment variables (static or vault references).'),
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

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;

const DEFAULTS: ContainerOpts = {
  platform: 'linux/arm64',
  workingDir: '/workspace',
};

@Injectable({ scope: Scope.TRANSIENT })
export class WorkspaceNode extends Node<ContainerProviderStaticConfig> {
  private idLabels: (id: string) => Record<string, string>;

  constructor(
    @Inject(ContainerService) protected containerService: ContainerService,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(NcpsKeyService) protected ncpsKeyService: NcpsKeyService,
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(EnvService) protected envService: EnvService,
  ) {
    super(logger);
    this.idLabels = (id: string) => ({ 'hautech.ai/thread_id': id, 'hautech.ai/node_id': this.nodeId });
  }

  init(params: { nodeId: string }): void {
    super.init(params);
  }

  getPortConfig() {
    return { sourcePorts: { $self: { kind: 'instance' as const } } } as const;
  }

  async provide(threadId: string): Promise<ContainerHandle> {
    // Build base thread labels and workspace-specific labels
    const labels = this.idLabels(threadId);
    const workspaceLabels = { ...labels, 'hautech.ai/role': 'workspace' } as Record<string, string>;
    // Primary lookup: thread-scoped workspace container only
    // Debug note: ContainerService logs the exact filters as well.
    // Optional local debug:
    // Avoid requiring DOM globals in server tests; guard console access
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      try {
        console.debug('[ContainerProviderEntity] lookup labels (workspace)', workspaceLabels);
      } catch {
        // ignore console debug errors in non-tty envs
      }
    }
    let container: ContainerHandle | undefined = await this.containerService.findContainerByLabels(workspaceLabels);

    // Typed fallback: retry by thread_id only and exclude DinD sidecars.
    if (!container) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        try {
          console.debug('[ContainerProviderEntity] fallback lookup by thread_id only', labels);
        } catch {
          // ignore console debug errors in non-tty envs
        }
      }
      const candidates = await this.containerService.findContainersByLabels(labels);
      if (Array.isArray(candidates) && candidates.length) {
        const results = await Promise.all(
          candidates.map(async (c) => {
            try {
              const cl = await this.containerService.getContainerLabels(c.id);
              return { c, cl };
            } catch {
              return { c, cl: undefined as Record<string, string> | undefined };
            }
          }),
        );
        container = this.chooseNonDinDContainer(results) ?? container;
      }
    }
    const enableDinD = this.config?.enableDinD ?? false;

    // Enforce non-reuse on platform mismatch if a platform is requested now
    const requestedPlatform = this.config?.platform ?? DEFAULTS.platform;
    if (container && requestedPlatform) {
      let existingPlatform: string | undefined;
      try {
        const containerLabels = await this.containerService.getContainerLabels(container.id);
        existingPlatform = containerLabels?.[PLATFORM_LABEL];
      } catch {
        existingPlatform = undefined; // treat as mismatch
      }
      const mismatched = !existingPlatform || existingPlatform !== requestedPlatform;
      if (mismatched) {
        if (enableDinD) await this.cleanupDinDSidecars(labels, container.id).catch(() => {});
        await this.stopAndRemoveContainer(container);
        container = undefined;
      }
    }

    if (!container) {
      const DOCKER_HOST_ENV = 'tcp://localhost:2375';
      const DOCKER_MIRROR_URL =
        this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      const enableDinD = this.config?.enableDinD ?? false;
      let envMerged: Record<string, string> | undefined = await (async () => {
        const base: Record<string, string> = Array.isArray(this.config.env)
          ? Object.fromEntries(
              (this.config.env || [])
                .map((s) => String(s))
                .map((pair) => {
                  const idx = pair.indexOf('=');
                  return idx > -1 ? [pair.slice(0, idx), pair.slice(idx + 1)] : [pair, ''];
                }),
            )
          : {};
        const cfgEnv = this.config?.env as Record<string, string> | EnvItem[] | undefined;
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
        ...DEFAULTS,
        image: this.config?.image ?? DEFAULTS.image,
        // Ensure env is in a format ContainerService understands (Record or string[]). envService returns Record.
        env: enableDinD ? { ...(normalizedEnv || {}), DOCKER_HOST: DOCKER_HOST_ENV } : normalizedEnv,
        labels: { ...workspaceLabels },
        platform: requestedPlatform,
        ttlSeconds: this.config?.ttlSeconds ?? 86400,
      });
      if (enableDinD) await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);

      if (this.config?.initialScript) {
        const script = this.config.initialScript;
        const { exitCode, stderr } = await container.exec(script, { tty: false });
        if (exitCode !== 0) {
          this.logger.error(
            `Initial script failed (exitCode=${exitCode}) for container ${container.id.substring(0, 12)}${stderr ? ` stderr: ${stderr}` : ''}`,
          );
        }
      }

      // Intentional ordering: run initialScript first, then Nix install.
      // This lets the script prepare environment (e.g., user/profile) before installing packages.
      // Install Nix packages when resolved specs are provided (best-effort)
      try {
        const nixUnknown = this.config?.nix as unknown;
        const pkgsUnknown =
          nixUnknown && typeof nixUnknown === 'object' && 'packages' in (nixUnknown as Record<string, unknown>)
            ? (nixUnknown as Record<string, unknown>)['packages']
            : undefined;
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
      if (this.config?.enableDinD && container) await this.ensureDinD(container, labels, DOCKER_MIRROR_URL);
      // Also attempt install on reuse (idempotent)
      try {
        const nixUnknown = this.config?.nix as unknown;
        const pkgsUnknown =
          nixUnknown && typeof nixUnknown === 'object' && 'packages' in (nixUnknown as Record<string, unknown>)
            ? (nixUnknown as Record<string, unknown>)['packages']
            : undefined;
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
    } catch {
      // ignore touch last-used errors
    }
    return container;
  }

  private async ensureDinD(workspace: ContainerHandle, baseLabels: Record<string, string>, mirrorUrl: string) {
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

  private async waitForDinDReady(dind: ContainerHandle) {
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
      } catch {
        // ignore exec errors
      }
      // Early fail if DinD exited unexpectedly (best-effort; skip if low-level client not available)
      await this.failFastIfDinDExited(dind);
      await sleep(1000);
    }
    throw new Error('DinD sidecar did not become ready within timeout');
  }

  private chooseNonDinDContainer(
    results: Array<{ c: ContainerHandle; cl?: Record<string, string> | undefined }>,
  ): ContainerHandle | undefined {
    for (const { c, cl } of results) {
      if (cl?.['hautech.ai/role'] === 'dind') continue;
      return c;
    }
    return undefined;
  }

  private async cleanupDinDSidecars(labels: Record<string, string>, parentId: string): Promise<void> {
    try {
      const dinds = await this.containerService.findContainersByLabels({
        ...labels,
        'hautech.ai/role': 'dind',
        'hautech.ai/parent_cid': parentId,
      });
      await Promise.all(
        dinds.map(async (d) => {
          try {
            await d.stop(5);
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
          }
          try {
            await d.remove(true);
          } catch (e: unknown) {
            const sc = getStatusCode(e);
            if (sc !== 404 && sc !== 409) throw e;
          }
        }),
      );
    } catch {
      // ignore DinD sidecar lookup errors
    }
  }

  private async stopAndRemoveContainer(container: ContainerHandle): Promise<void> {
    try {
      await container.stop();
    } catch (e: unknown) {
      const sc = getStatusCode(e);
      if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
    }
    try {
      await container.remove(true);
    } catch (e: unknown) {
      const sc = getStatusCode(e);
      if (sc !== 404 && sc !== 409) throw e;
    }
  }

  private async failFastIfDinDExited(dind: ContainerHandle): Promise<void> {
    // Typed guard around Docker inspect; tests may stub ContainerService minimally.
    try {
      const docker = this.containerService.getDocker();
      const inspect = await docker.getContainer(dind.id).inspect();
      const state = (inspect as { State?: { Running?: boolean; Status?: string } }).State;
      if (state && state.Running === false) {
        throw new Error(`DinD sidecar exited unexpectedly: status=${state.Status}`);
      }
    } catch (e) {
      // On missing methods or errors, surface a typed error
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
        /^[A-Za-z0-9_.+-]+$/.test(ap) &&
        ap.length > 0
      ) {
        specs.push({ commitHash: ch, attributePath: ap });
      }
    }
    return specs;
  }

  // Install Nix packages in the container profile using combined install with per-package fallback
  private async ensureNixPackages(
    container: ContainerHandle,
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
