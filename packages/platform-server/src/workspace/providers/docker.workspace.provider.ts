import { Inject, Injectable, Logger } from '@nestjs/common';
import { mapInspectMounts, type ContainerHandle, type ContainerOpts, type SidecarOpts, PLATFORM_LABEL } from '@agyn/docker-runner';
import { DOCKER_CLIENT, type DockerClient } from '../../infra/container/dockerClient.token';
import { ContainerRegistry } from '../../infra/container/container.registry';
import {
  DestroyWorkspaceOptions,
  EnsureWorkspaceResult,
  WorkspaceExecRequest,
  WorkspaceExecResult,
  WorkspaceKey,
  WorkspaceLogsRequest,
  WorkspaceLogsSession,
  WorkspaceRuntimeCapabilities,
  WorkspaceRuntimeProvider,
  WorkspaceSpec,
  WorkspaceStdioSession,
  WorkspaceStdioSessionRequest,
  WorkspaceTerminalSession,
  WorkspaceTerminalSessionRequest,
  WorkspaceStatus,
  WorkspaceRuntimeProviderType,
} from '../runtime/workspace.runtime.provider';

const WORKSPACE_ROLE_LABEL = 'hautech.ai/role';
const THREAD_ID_LABEL = 'hautech.ai/thread_id';
const NODE_ID_LABEL = 'hautech.ai/node_id';
const DEFAULT_TTL_SECONDS = 86_400;

const DOCKER_ROLE_DIND = 'dind';
const DOCKER_ROLE_SIDECAR = 'sidecar';
const DIND_IMAGE = 'docker:27-dind';
const DIND_DEFAULT_MIRROR = 'http://registry-mirror:5000';
const DIND_HOST = 'tcp://0.0.0.0:2375';

@Injectable()
export class DockerWorkspaceRuntimeProvider extends WorkspaceRuntimeProvider {
  private readonly logger = new Logger(DockerWorkspaceRuntimeProvider.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly containers: DockerClient,
    private readonly registry: ContainerRegistry,
  ) {
    super();
  }

  capabilities(): WorkspaceRuntimeCapabilities {
    return {
      persistentVolume: true,
      dockerInDocker: true,
      stdioSession: true,
      terminalSession: true,
      logsSession: true,
    };
  }

  async ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec): Promise<EnsureWorkspaceResult> {
    const baseLabels = this.buildBaseLabels(key);
    const workspaceLabels = { ...baseLabels, [WORKSPACE_ROLE_LABEL]: 'workspace' } as Record<string, string>;

    let handle = await this.containers.findContainerByLabels(workspaceLabels);
    let created = false;

    if (!handle) {
      handle = await this.findFallbackContainer(baseLabels);
    }

    const logContext = {
      threadId: key.threadId,
      nodeId: key.nodeId ?? 'unknown',
    } as const;
    const previousContainerId = handle?.id;
    let existingPlatformLabel: string | undefined;

    if (handle) {
      existingPlatformLabel = await this.getContainerPlatformLabel(handle.id);
    }

    let recreatedForPlatform = false;
    if (handle && (await this.shouldRecreateForPlatform(handle, key, existingPlatformLabel))) {
      this.logger.debug('Recreating workspace container', {
        ...logContext,
        containerId: handle.id.substring(0, 12),
        reason: 'platform_mismatch',
        expectedPlatform: key.platform ?? null,
        existingPlatform: existingPlatformLabel ?? null,
      });
      await this.stopAndRemoveContainer(handle);
      handle = undefined;
      recreatedForPlatform = true;
    }

    if (!handle) {
      handle = await this.createWorkspace(key, spec, baseLabels, workspaceLabels);
      created = true;
      if (!handle) {
        throw new Error('workspace_provision_failed');
      }
      await this.registerWorkspaceContainer(handle.id, key, spec);
    } else {
      await this.registerWorkspaceContainer(handle.id, key, spec);
    }

    if (!handle) {
      throw new Error('workspace_provision_failed');
    }

    const workspaceHandle = handle;

    try {
      await this.containers.touchLastUsed(workspaceHandle.id);
    } catch {
      // ignore errors
    }

    const providerType: WorkspaceRuntimeProviderType = 'docker';
    const status = await this.resolveWorkspaceStatus(workspaceHandle.id);
    this.logger.debug('ensureWorkspace resolved container', {
      ...logContext,
      previousContainerId: previousContainerId ? previousContainerId.substring(0, 12) : null,
      containerId: workspaceHandle.id.substring(0, 12),
      keyPlatform: key.platform ?? null,
      existingPlatformLabel: existingPlatformLabel ?? null,
      created,
      recreatedForPlatform,
    });
    return { workspaceId: workspaceHandle.id, created, providerType, status };
  }

  async exec(workspaceId: string, request: WorkspaceExecRequest): Promise<WorkspaceExecResult> {
    return this.containers.execContainer(workspaceId, request.command, {
      workdir: request.workdir,
      env: request.env,
      timeoutMs: request.timeoutMs,
      idleTimeoutMs: request.idleTimeoutMs,
      killOnTimeout: request.killOnTimeout,
      tty: request.tty,
      signal: request.signal,
      onOutput: request.onOutput,
      logToPid1: request.logToPid1,
    });
  }

  async openStdioSession(
    workspaceId: string,
    request: WorkspaceStdioSessionRequest,
  ): Promise<WorkspaceStdioSession> {
    const session = await this.containers.openInteractiveExec(workspaceId, request.command, {
      workdir: request.workdir,
      env: request.env,
      tty: request.tty ?? false,
      demuxStderr: request.demuxStderr ?? true,
    });

    return {
      stdin: session.stdin,
      stdout: session.stdout,
      stderr: session.stderr,
      close: session.close,
    };
  }

  async openTerminalSession(
    workspaceId: string,
    request: WorkspaceTerminalSessionRequest,
  ): Promise<WorkspaceTerminalSession> {
    const session = await this.containers.openInteractiveExec(workspaceId, request.command, {
      workdir: request.workdir,
      env: request.env,
      tty: true,
      demuxStderr: request.demuxStderr ?? false,
    });

    const resize = async (size: { cols: number; rows: number }) => {
      await this.containers.resizeExec(session.execId, size);
    };

    if (request.size) {
      await resize(request.size).catch((err) => {
        this.logger.warn('Initial terminal resize failed', {
          execId: session.execId.substring(0, 12),
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return {
      sessionId: session.execId,
      execId: session.execId,
      stdin: session.stdin,
      stdout: session.stdout,
      stderr: session.stderr,
      resize,
      close: session.close,
    };
  }

  async putArchive(
    workspaceId: string,
    data: Buffer | NodeJS.ReadableStream,
    options: { path?: string } = { path: '/tmp' },
  ): Promise<void> {
    const path = options?.path ?? '/tmp';
    await this.containers.putArchive(workspaceId, data, { path });
  }

  async openLogsSession(workspaceId: string, request: WorkspaceLogsRequest): Promise<WorkspaceLogsSession> {
    return this.containers.streamContainerLogs(workspaceId, request);
  }

  async destroyWorkspace(workspaceId: string, options: DestroyWorkspaceOptions = {}): Promise<void> {
    const labels = await this.safeGetLabels(workspaceId);

    try {
      await this.containers.stopContainer(workspaceId, 10);
    } catch (err) {
      if (!this.isBenignDockerError(err, [304, 404, 409])) throw err;
    }

    try {
      await this.containers.removeContainer(workspaceId, {
        force: options.force ?? false,
        removeVolumes: false,
      });
    } catch (err) {
      if (!this.isBenignDockerError(err, [404, 409])) throw err;
    }

    if (options.removePersistentVolume && labels?.[THREAD_ID_LABEL]) {
      await this.removeWorkspaceVolume(labels[THREAD_ID_LABEL]).catch((err) => {
        this.logger.warn('Failed to remove workspace volume', {
          workspaceId: workspaceId.substring(0, 12),
          threadId: labels[THREAD_ID_LABEL],
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  async touchWorkspace(workspaceId: string): Promise<void> {
    await this.containers.touchLastUsed(workspaceId).catch(() => undefined);
  }

  private async resolveWorkspaceStatus(containerId: string): Promise<WorkspaceStatus> {
    try {
      const details = await this.containers.inspectContainer(containerId);
      const raw = typeof details?.State?.Status === 'string' ? details.State.Status.toLowerCase() : '';
      switch (raw) {
        case 'created':
        case 'restarting':
        case 'paused':
          return 'starting';
        case 'running':
          return 'running';
        case 'removing':
        case 'dead':
        case 'exited':
          return 'stopped';
        default:
          return raw ? 'error' : 'running';
      }
    } catch (err) {
      this.logger.warn('Workspace status inspection failed', {
        workspaceId: containerId.substring(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      return 'running';
    }
  }

  private buildBaseLabels(key: WorkspaceKey): Record<string, string> {
    const labels: Record<string, string> = { [THREAD_ID_LABEL]: key.threadId };
    if (key.nodeId) labels[NODE_ID_LABEL] = key.nodeId;
    return labels;
  }

  private async findFallbackContainer(labels: Record<string, string>): Promise<ContainerHandle | undefined> {
    const candidates = await this.containers.findContainersByLabels(labels);
    if (!candidates.length) return undefined;
    const enriched = await Promise.all(
      candidates.map(async (c) => {
        try {
          const cl = await this.containers.getContainerLabels(c.id);
          return { c, cl };
        } catch {
          return { c, cl: undefined };
        }
      }),
    );
    return this.chooseWorkspaceContainer(enriched);
  }

  private chooseWorkspaceContainer(
    results: Array<{ c: ContainerHandle; cl?: Record<string, string> | undefined }>,
  ): ContainerHandle | undefined {
    for (const { c, cl } of results) {
      const role = cl?.[WORKSPACE_ROLE_LABEL];
      if (role === DOCKER_ROLE_DIND || role === DOCKER_ROLE_SIDECAR) continue;
      return c;
    }
    return undefined;
  }

  private async shouldRecreateForPlatform(
    handle: ContainerHandle,
    key: WorkspaceKey,
    existingPlatformLabel?: string,
  ): Promise<boolean> {
    if (!key.platform) return false;
    if (existingPlatformLabel !== undefined) {
      return existingPlatformLabel !== key.platform;
    }
    try {
      const labels = await this.containers.getContainerLabels(handle.id);
      const existing = labels?.[PLATFORM_LABEL];
      return existing !== key.platform;
    } catch {
      return true;
    }
  }

  private async getContainerPlatformLabel(containerId: string): Promise<string | undefined> {
    try {
      const labels = await this.containers.getContainerLabels(containerId);
      return labels?.[PLATFORM_LABEL];
    } catch (err) {
      this.logger.debug('Failed to read workspace platform label', {
        containerId: containerId.substring(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  private async createWorkspace(
    key: WorkspaceKey,
    spec: WorkspaceSpec,
    baseLabels: Record<string, string>,
    workspaceLabels: Record<string, string>,
  ): Promise<ContainerHandle> {
    const binds = spec.persistentVolume
      ? [this.volumeBindFor(key.threadId, spec.persistentVolume.mountPath)]
      : undefined;
    const createExtras = this.buildCreateExtras(spec.resources);
    const sidecars = spec.dockerInDocker?.enabled
      ? [this.buildDinDSidecarOpts(baseLabels, spec.dockerInDocker?.mirrorUrl)]
      : undefined;
    const startOptions: ContainerOpts = {
      workingDir: spec.workingDir,
      env: spec.env,
      labels: workspaceLabels,
      platform: key.platform,
      binds,
      ttlSeconds: spec.ttlSeconds ?? DEFAULT_TTL_SECONDS,
      createExtras,
      sidecars,
    };
    if (spec.image) startOptions.image = spec.image;
    const container = await this.containers.start(startOptions);
    return container;
  }

  private async registerWorkspaceContainer(containerId: string, key: WorkspaceKey, spec: WorkspaceSpec): Promise<void> {
    let inspectId: string | undefined;
    let resolvedName: string | undefined;
    try {
      const inspect = await this.containers.inspectContainer(containerId);
      inspectId = typeof inspect.Id === 'string' ? inspect.Id : containerId;
      const labels = inspect.Config?.Labels ?? {};
      const nodeId = key.nodeId ?? labels[NODE_ID_LABEL] ?? 'unknown';
      const threadId = key.threadId ?? labels[THREAD_ID_LABEL] ?? '';
      const mounts = mapInspectMounts(inspect.Mounts);
      const inspectNameRaw = typeof inspect.Name === 'string' ? inspect.Name : null;
      const normalizedName = inspectNameRaw?.trim().replace(/^\/+/, '') ?? null;
      resolvedName = (normalizedName && normalizedName.length > 0 ? normalizedName : inspectId.substring(0, 63)).slice(0, 63);
      const image = inspect.Config?.Image ?? spec.image ?? inspect.Image ?? 'unknown';
      this.logger.log('Registering workspace container', {
        containerId: inspectId.substring(0, 12),
        name: resolvedName,
        image,
      });
      await this.registry.registerStart({
        containerId: inspectId,
        nodeId,
        threadId,
        image,
        labels,
        platform: labels[PLATFORM_LABEL] ?? key.platform,
        ttlSeconds: spec.ttlSeconds ?? DEFAULT_TTL_SECONDS,
        mounts: mounts.length ? mounts : undefined,
        name: resolvedName,
      });
    } catch (err) {
      this.logger.error('Failed to register workspace container start', {
        containerId: containerId.substring(0, 12),
        inspectId,
        resolvedName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private buildCreateExtras(resources: WorkspaceSpec['resources'] | undefined): ContainerOpts['createExtras'] | undefined {
    const hostConfig = resources
      ? {
          HostConfig: {
            ...(typeof resources.cpuNano === 'number' ? { NanoCPUs: resources.cpuNano } : {}),
            ...(typeof resources.memoryBytes === 'number' ? { Memory: resources.memoryBytes } : {}),
          },
        }
      : undefined;

    return hostConfig ?? undefined;
  }

  private volumeBindFor(threadId: string, mountPath: string): string {
    const volumeName = `ha_ws_${threadId}`;
    return `${volumeName}:${mountPath}`;
  }

  private buildDinDSidecarOpts(baseLabels: Record<string, string>, mirrorUrl?: string): SidecarOpts {
    const registryMirror = mirrorUrl ?? DIND_DEFAULT_MIRROR;
    return {
      image: DIND_IMAGE,
      env: { DOCKER_TLS_CERTDIR: '' },
      cmd: ['-H', DIND_HOST, '--registry-mirror', registryMirror],
      privileged: true,
      autoRemove: true,
      anonymousVolumes: ['/var/lib/docker'],
      labels: { ...baseLabels },
      networkMode: 'container:main',
    };
  }

  private async stopAndRemoveContainer(container: ContainerHandle): Promise<void> {
    try {
      await container.stop();
    } catch (err) {
      if (!this.isBenignDockerError(err, [304, 404, 409])) throw err;
    }
    try {
      await container.remove(true);
    } catch (err) {
      if (!this.isBenignDockerError(err, [404, 409])) throw err;
    }
  }

  private isBenignDockerError(err: unknown, allowed: number[]): boolean {
    const code = getStatusCode(err);
    return code !== undefined && allowed.includes(code);
  }

  private async safeGetLabels(containerId: string): Promise<Record<string, string> | undefined> {
    try {
      return await this.containers.getContainerLabels(containerId);
    } catch {
      return undefined;
    }
  }

  private async removeWorkspaceVolume(threadId: string): Promise<void> {
    const volumeName = `ha_ws_${threadId}`;
    const containers = await this.containers.listContainersByVolume(volumeName);
    if (containers.length > 0) {
      this.logger.warn('Workspace volume still in use; skipping removal', {
        threadId,
        volumeName,
        containerIds: containers.map((id) => id.substring(0, 12)),
      });
      return;
    }
    await this.containers.removeVolume(volumeName, { force: true });
  }
}

function getStatusCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const value = (err as { statusCode?: unknown }).statusCode;
    if (typeof value === 'number') return value;
  }
  return undefined;
}
