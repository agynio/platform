import { ContainerOpts, ContainerService } from '../../infra/container/container.service';
import Node from '../base/Node';
import { ContainerHandle } from '../../infra/container/container.handle';
import { z } from 'zod';
import { PLATFORM_LABEL, SUPPORTED_PLATFORMS } from '../../core/constants';
import { ConfigService } from '../../core/services/config.service';
import { NcpsKeyService } from '../../infra/ncps/ncpsKey.service';
import { EnvService, type EnvItem } from '../../env/env.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { SecretReferenceSchema, VariableReferenceSchema } from '../../utils/reference-schemas';

// Static configuration schema for ContainerProviderEntity
// Allows overriding the base image and supplying environment variables.
// New env item type with source-aware reference
const EnvItemSchema = z
  .object({
    key: z.string().min(1),
    value: z.union([z.string(), SecretReferenceSchema, VariableReferenceSchema]),
  })
  .strict()
  .describe('Environment variable entry supporting plain values, vault references, or variables.');

const VolumeConfigSchema = z
  .object({
    enabled: z.boolean().default(false).describe('Enable persistent named volume mount for the workspace.'),
    mountPath: z
      .string()
      .min(1)
      .regex(/^\//, 'Mount path must be absolute')
      .default('/workspace')
      .describe('Absolute container path to mount the workspace volume.'),
  })
  .strict();

export const ContainerProviderStaticConfigSchema = z
  .object({
    image: z.string().min(1).optional().describe('Optional container image override.'),
    env: z.array(EnvItemSchema).optional().describe('Environment variables (plain, vault, or variable references).'),
    initialScript: z
      .string()
      .optional()
      .describe('Shell script (executed with /bin/sh -lc) to run immediately after creating the container.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    cpu_limit: z
      .union([z.number(), z.string().min(1)])
      .optional()
      .describe('Optional CPU limit (cores as number or string in millicores, e.g., "500m").'),
    memory_limit: z
      .union([z.number(), z.string().min(1)])
      .optional()
      .describe('Optional memory limit (bytes as number or string with Ki, Mi, Gi, Ti, KB, MB, GB, or B units).'),
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
    volumes: VolumeConfigSchema.optional(),
  })
  .strict();

export type ContainerProviderStaticConfig = z.infer<typeof ContainerProviderStaticConfigSchema>;
type VolumeConfig = z.infer<typeof VolumeConfigSchema>;

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
    @Inject(EnvService) protected envService: EnvService,
  ) {
    super();
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
    this.logger.debug(
      `[ContainerProviderEntity] lookup labels (workspace) labels=${JSON.stringify(workspaceLabels)}`,
    );
    let container: ContainerHandle | undefined = await this.containerService.findContainerByLabels(workspaceLabels);

    // Typed fallback: retry by thread_id only and exclude DinD sidecars.
    if (!container) {
      this.logger.debug(
        `[ContainerProviderEntity] fallback lookup by thread_id only labels=${JSON.stringify(labels)}`,
      );
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
    const networkName = this.configService.workspaceNetworkName;

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

    if (container) {
      const shortId = container.id.substring(0, 12);
      let networks: string[] | undefined;
      try {
        networks = await this.containerService.getContainerNetworks(container.id);
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to inspect workspace networks containerId=${shortId} error=${errMessage}`);
      }
      const attachedToNetwork = Array.isArray(networks) && networks.includes(networkName);
      if (!attachedToNetwork) {
        const networksList = Array.isArray(networks) ? networks.join(',') : 'none';
        this.logger.log(
          `Recreating workspace to enforce workspace network containerId=${shortId} requiredNetwork=${networkName} networks=${networksList}`,
        );
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
      const volumeConfig: VolumeConfig | undefined = this.config?.volumes;
      const volumesEnabled = volumeConfig?.enabled ?? false;
      const normalizedMountPath = volumesEnabled ? volumeConfig?.mountPath ?? DEFAULTS.workingDir : DEFAULTS.workingDir;
      const volumeName = `ha_ws_${threadId}`;
      const binds = volumesEnabled ? [`${volumeName}:${normalizedMountPath}`] : undefined;
      let envMerged: Record<string, string> | undefined = await (async () => {
        const cfgEnv = this.config?.env as Record<string, string> | EnvItem[] | undefined;
        const base: Record<string, string> = !Array.isArray(cfgEnv) && cfgEnv ? { ...cfgEnv } : {};
        return this.envService.resolveProviderEnv(cfgEnv, undefined, base);
      })();
      // Inject NIX_CONFIG only when not present and ncps is explicitly enabled and fully configured

      const hasNixConfig =
        !!envMerged && typeof envMerged === 'object' && 'NIX_CONFIG' in (envMerged as Record<string, string>);
      const ncpsEnabled = this.configService?.ncpsEnabled === true;
      const ncpsUrl = this.configService?.ncpsUrl;
      const keys = this.ncpsKeyService?.getKeysForInjection() || [];
      let nixConfigInjected = false;
      if (!hasNixConfig && ncpsEnabled && !!ncpsUrl && keys.length > 0) {
        const joined = keys.join(' ');
        const nixConfig = `substituters = ${ncpsUrl} https://cache.nixos.org\ntrusted-public-keys = ${joined} cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=`;
        envMerged = { ...(envMerged || {}), NIX_CONFIG: nixConfig } as Record<string, string>;
        nixConfigInjected = true;
      }

      const normalizedEnv: Record<string, string> | undefined = envMerged;
      const cpuLimitNano = this.normalizeCpuLimit(this.config?.cpu_limit);
      const memoryLimitBytes = this.normalizeMemoryLimit(this.config?.memory_limit);
      const networkAlias = this.sanitizeNetworkAlias(threadId);
      const createExtrasHostConfig =
        cpuLimitNano !== undefined || memoryLimitBytes !== undefined
          ? {
              HostConfig: {
                ...(cpuLimitNano !== undefined ? { NanoCPUs: cpuLimitNano } : {}),
                ...(memoryLimitBytes !== undefined ? { Memory: memoryLimitBytes } : {}),
              },
            }
          : undefined;
      const createExtrasNetworking: ContainerOpts['createExtras'] = {
        NetworkingConfig: {
          EndpointsConfig: {
            [networkName]: {
              Aliases: [networkAlias],
            },
          },
        },
      };
      const createExtras: ContainerOpts['createExtras'] | undefined =
        createExtrasHostConfig
          ? {
              ...createExtrasHostConfig,
              ...createExtrasNetworking,
            }
          : createExtrasNetworking;
      const started = await this.containerService.start({
        ...DEFAULTS,
        workingDir: normalizedMountPath,
        binds,
        image: this.config?.image ?? DEFAULTS.image,
        // Ensure env is in a format ContainerService understands (Record or string[]). envService returns Record.
        env: enableDinD ? { ...(normalizedEnv || {}), DOCKER_HOST: DOCKER_HOST_ENV } : normalizedEnv,
        labels: { ...workspaceLabels },
        platform: requestedPlatform,
        ttlSeconds: this.config?.ttlSeconds ?? 86400,
        createExtras,
      });
      container = started;
      if (enableDinD) await this.ensureDinD(started, labels, DOCKER_MIRROR_URL);
      if (nixConfigInjected) {
        await this.runWorkspaceNetworkDiagnostics(started).catch((err: unknown) => {
          const errMessage = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Workspace Nix diagnostics failed containerId=${started.id.substring(0, 12)} error=${errMessage}`,
          );
        });
      }

      if (this.config?.initialScript) {
        const script = this.config.initialScript;
        const { exitCode, stderr } = await started.exec(script, { tty: false });
        if (exitCode !== 0) {
          this.logger.error(
            `Initial script failed (exitCode=${exitCode}) for container ${started.id.substring(0, 12)}${stderr ? ` stderr: ${stderr}` : ''}`,
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
        await this.ensureNixPackages(started, specs, originalCount);
      } catch (e) {
        // Do not fail startup on install errors; logs provide context
        const errMessage = e instanceof Error ? e.message : String(e);
        this.logger.error(`Nix install step failed (post-start): ${errMessage}`);
      }
    } else {
      const DOCKER_MIRROR_URL =
        this.configService?.dockerMirrorUrl || process.env.DOCKER_MIRROR_URL || 'http://registry-mirror:5000';
      const existing = container;
      if (!existing) {
        throw new Error('Workspace container expected but not found for reuse path');
      }
      if (this.config?.enableDinD) await this.ensureDinD(existing, labels, DOCKER_MIRROR_URL);
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
        await this.ensureNixPackages(existing, specs, originalCount);
      } catch (e) {
        const errMessage = e instanceof Error ? e.message : String(e);
        this.logger.error(`Nix install step failed (reuse): ${errMessage}`);
      }
    }
    const handle = container;
    if (!handle) {
      throw new Error('Workspace container not provisioned');
    }
    try {
      await this.containerService.touchLastUsed(handle.id);
    } catch {
      // ignore touch last-used errors
    }
    return handle;
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

  private sanitizeNetworkAlias(threadId: string): string {
    const normalized = (threadId ?? '').toLowerCase();
    const replaced = normalized.replace(/[^a-z0-9_.-]/g, '-');
    const collapsed = replaced.replace(/-+/g, '-');
    const trimmed = collapsed.replace(/^-+/, '').replace(/-+$/, '');
    const truncated = trimmed.slice(0, 63);
    if (truncated && /^[a-z0-9]/.test(truncated)) return truncated;
    const alnum = normalized.replace(/[^a-z0-9]/g, '');
    if (alnum) {
      const suffix = alnum.slice(0, 61);
      return `ws-${suffix}`.slice(0, 63);
    }
    const encoded = Array.from(normalized)
      .map((ch) => ch.charCodeAt(0).toString(36))
      .join('')
      .slice(0, 20);
    return `ws-${encoded || 'thread'}`.slice(0, 63);
  }

  private async runWorkspaceNetworkDiagnostics(container: ContainerHandle): Promise<void> {
    const shortId = container.id.substring(0, 12);
    try {
      const { stdout } = await container.exec([
        'sh',
        '-lc',
        "nix show-config | grep -E '^(substituters|trusted-public-keys)\\s*=' || true",
      ]);
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length) {
        for (const line of lines) {
          this.logger.log(`Workspace Nix config containerId=${shortId} line=${line}`);
        }
      } else {
        this.logger.warn(
          `Workspace Nix config produced no substituters/trusted-public-keys output containerId=${shortId}`,
        );
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Workspace Nix config check failed containerId=${shortId} error=${errMessage}`);
    }

    await this.runWorkspaceDiagnosticCommand(container, 'getent hosts ncps', 'ncps host lookup');
    await this.runWorkspaceDiagnosticCommand(
      container,
      'curl -sSf --max-time 3 http://ncps:8501/nix-cache-info',
      'ncps cache probe',
      { logStdoutSnippet: true },
    );
  }

  private async runWorkspaceDiagnosticCommand(
    container: ContainerHandle,
    command: string,
    description: string,
    options: { logStdoutSnippet?: boolean } = {},
  ): Promise<void> {
    const shortId = container.id.substring(0, 12);
    try {
      const { stdout, stderr, exitCode } = await container.exec(['sh', '-lc', command]);
      if (exitCode === 0) {
        const payload = options.logStdoutSnippet ? this.snip(stdout) : stdout.trim();
        this.logger.log(`Workspace ${description} succeeded containerId=${shortId} stdout=${payload}`);
      } else {
        const stdoutTrimmed = stdout.trim();
        const stderrTrimmed = stderr.trim();
        this.logger.warn(
          `Workspace ${description} failed containerId=${shortId} exitCode=${exitCode} stdout=${stdoutTrimmed} stderr=${stderrTrimmed}`,
        );
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Workspace ${description} error containerId=${shortId} error=${errMessage}`);
    }
  }

  private snip(value: string, max = 256): string {
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max)}...`;
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

  private normalizeCpuLimit(raw: unknown): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    const logInvalid = (reason: string) => {
      const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
      this.logger.warn(`Workspace cpu_limit invalid; ignoring reason=${reason} value=${value}`);
    };
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw) || raw <= 0) {
        logInvalid('non-positive number');
        return undefined;
      }
      return Math.round(raw * 1_000_000_000);
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        logInvalid('empty string');
        return undefined;
      }
      const lower = trimmed.toLowerCase();
      const milliMatch = /^([0-9]+(?:\.[0-9]+)?)m$/.exec(lower);
      if (milliMatch) {
        const value = Number.parseFloat(milliMatch[1]);
        if (!Number.isFinite(value) || value <= 0) {
          logInvalid('invalid millicore value');
          return undefined;
        }
        return Math.round(value * 1_000_000);
      }
      const numericMatch = /^([0-9]+(?:\.[0-9]+)?)$/.exec(lower);
      if (numericMatch) {
        const value = Number.parseFloat(numericMatch[1]);
        if (!Number.isFinite(value) || value <= 0) {
          logInvalid('invalid numeric string');
          return undefined;
        }
        return Math.round(value * 1_000_000_000);
      }
      logInvalid('unsupported string format');
      return undefined;
    }
    logInvalid(`unsupported type ${typeof raw}`);
    return undefined;
  }

  private normalizeMemoryLimit(raw: unknown): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    const logInvalid = (reason: string) => {
      const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
      this.logger.warn(`Workspace memory_limit invalid; ignoring reason=${reason} value=${value}`);
    };
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw) || raw <= 0) {
        logInvalid('non-positive number');
        return undefined;
      }
      return Math.round(raw);
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        logInvalid('empty string');
        return undefined;
      }
      const lower = trimmed.toLowerCase();
      const unitMatch = /^([0-9]+(?:\.[0-9]+)?)(ki|mi|gi|ti|kb|mb|gb|b)$/.exec(lower);
      if (unitMatch) {
        const value = Number.parseFloat(unitMatch[1]);
        if (!Number.isFinite(value) || value <= 0) {
          logInvalid('invalid unit value');
          return undefined;
        }
        const unit = unitMatch[2];
        const multipliers: Record<string, number> = {
          ki: 1024,
          mi: 1024 ** 2,
          gi: 1024 ** 3,
          ti: 1024 ** 4,
          kb: 1000,
          mb: 1000 ** 2,
          gb: 1000 ** 3,
          b: 1,
        };
        const multiplier = multipliers[unit];
        if (!multiplier) {
          logInvalid('unsupported unit');
          return undefined;
        }
        return Math.round(value * multiplier);
      }
      const numericMatch = /^([0-9]+(?:\.[0-9]+)?)$/.exec(lower);
      if (numericMatch) {
        const value = Number.parseFloat(numericMatch[1]);
        if (!Number.isFinite(value) || value <= 0) {
          logInvalid('invalid numeric string');
          return undefined;
        }
        return Math.round(value);
      }
      logInvalid('unsupported string format');
      return undefined;
    }
    logInvalid(`unsupported type ${typeof raw}`);
    return undefined;
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
          this.logger.log('nix.packages present but unresolved; skipping install');
        }
        return;
      }
      // Log when some items are ignored due to missing fields
      if ((originalCount || 0) > specs.length) {
        const ignored = (originalCount || 0) - specs.length;
        this.logger.log(`${ignored} nix.packages item(s) missing commitHash/attributePath; ignored`);
      }
      // Detect Nix presence quickly
      const detect = await container.exec('command -v nix >/dev/null 2>&1 && nix --version', {
        timeoutMs: 5000,
        idleTimeoutMs: 0,
      });
      if (detect.exitCode !== 0) {
        this.logger.log('Nix not present; skipping install');
        return;
      }
      const refs = specs.map((s) => `github:NixOS/nixpkgs/${s.commitHash}#${s.attributePath}`);
      const PATH_PREFIX = 'export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"';
      const BASE =
        "nix profile install --accept-flake-config --extra-experimental-features 'nix-command flakes' --no-write-lock-file";
      const combined = `${PATH_PREFIX} && ${BASE} ${refs.join(' ')}`;
      this.logger.log(`Nix install: ${refs.length} packages (combined)`);
      const combinedRes = await container.exec(combined, { timeoutMs: 10 * 60_000, idleTimeoutMs: 60_000 });
      if (combinedRes.exitCode === 0) return;
      // Fallback per package
      this.logger.error(`Nix install (combined) failed exitCode=${combinedRes.exitCode}`);
      const cmdFor = (ref: string) => `${PATH_PREFIX} && ${BASE} ${ref}`;
      const timeoutOpts = { timeoutMs: 3 * 60_000, idleTimeoutMs: 60_000 } as const;
      await refs.reduce<Promise<void>>(
        (p, ref) =>
          p.then(async () => {
            const r = await container.exec(cmdFor(ref), timeoutOpts);
            if (r.exitCode === 0) this.logger.log(`Nix install succeeded for ${ref}`);
            else this.logger.error(`Nix install failed for ${ref} exitCode=${r.exitCode}`);
          }),
        Promise.resolve(),
      );
    } catch (e) {
      // Surface via logger; caller swallows to avoid failing startup
      const errMessage = e instanceof Error ? e.message : String(e);
      this.logger.error(`Nix install threw: ${errMessage}`);
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
