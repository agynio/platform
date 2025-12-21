import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContainerHandle } from '../../infra/container/container.handle';
import { ContainerOpts, ContainerService } from '../../infra/container/container.service';
import { PLATFORM_LABEL } from '../../core/constants';
import {
  DestroyWorkspaceOptions,
  ExecRequest,
  ExecResult,
  InteractiveExecRequest,
  InteractiveExecSession,
  WorkspaceKey,
  WorkspaceProvider,
  WorkspaceProviderCapabilities,
  WorkspaceSpec,
} from './workspace.provider';

const WORKSPACE_ROLE_LABEL = 'hautech.ai/role';
const THREAD_ID_LABEL = 'hautech.ai/thread_id';
const NODE_ID_LABEL = 'hautech.ai/node_id';
const PARENT_CONTAINER_LABEL = 'hautech.ai/parent_cid';
const DEFAULT_NETWORK_NAME = 'agents_net';
const DEFAULT_TTL_SECONDS = 86_400;

const DOCKER_ROLE_DIND = 'dind';
const DIND_IMAGE = 'docker:27-dind';
const DIND_DEFAULT_MIRROR = 'http://registry-mirror:5000';
const DIND_HOST = 'tcp://0.0.0.0:2375';

@Injectable()
export class DockerWorkspaceProvider extends WorkspaceProvider {
  private readonly logger = new Logger(DockerWorkspaceProvider.name);

  constructor(@Inject(ContainerService) private readonly containers: ContainerService) {
    super();
  }

  capabilities(): WorkspaceProviderCapabilities {
    return {
      persistentVolume: true,
      network: true,
      networkAliases: true,
      dockerInDocker: true,
      interactiveExec: true,
      execResize: true,
    };
  }

  async ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec): Promise<{ workspaceId: string; created: boolean }> {
    const baseLabels = this.buildBaseLabels(key);
    const workspaceLabels = { ...baseLabels, [WORKSPACE_ROLE_LABEL]: 'workspace' } as Record<string, string>;
    const networkName = spec.network?.name ?? DEFAULT_NETWORK_NAME;

    let handle = await this.containers.findContainerByLabels(workspaceLabels);
    let created = false;

    if (!handle) {
      handle = await this.findFallbackContainer(baseLabels);
    }

    const dinDRequested = spec.dockerInDocker?.enabled ?? false;

    if (handle && (await this.shouldRecreateForPlatform(handle, key))) {
      if (dinDRequested) await this.cleanupDinDSidecars(baseLabels, handle.id).catch(() => undefined);
      await this.stopAndRemoveContainer(handle);
      handle = undefined;
    }

    if (handle && !(await this.isAttachedToNetwork(handle.id, networkName))) {
      if (dinDRequested) await this.cleanupDinDSidecars(baseLabels, handle.id).catch(() => undefined);
      await this.stopAndRemoveContainer(handle);
      handle = undefined;
    }

    if (!handle) {
      handle = await this.createWorkspace(key, spec, workspaceLabels, networkName);
      created = true;
      if (dinDRequested) {
        await this.ensureDinD(handle, baseLabels, spec.dockerInDocker?.mirrorUrl);
      }
    } else if (dinDRequested) {
      await this.ensureDinD(handle, baseLabels, spec.dockerInDocker?.mirrorUrl).catch((err) => {
        this.logger.warn('DinD ensure failed during reuse', {
          workspaceId: handle?.id.substring(0, 12),
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      });
    } else {
      await this.cleanupDinDSidecars(baseLabels, handle.id).catch(() => undefined);
    }

    if (!handle) {
      throw new Error('workspace_provision_failed');
    }

    try {
      await this.containers.touchLastUsed(handle.id);
    } catch {
      // ignore errors
    }

    return { workspaceId: handle.id, created };
  }

  async exec(workspaceId: string, request: ExecRequest): Promise<ExecResult> {
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

  async openInteractiveExec(workspaceId: string, request: InteractiveExecRequest): Promise<InteractiveExecSession> {
    return this.containers.openInteractiveExec(workspaceId, request.command, {
      workdir: request.workdir,
      env: request.env,
      tty: request.tty,
      demuxStderr: request.demuxStderr,
    });
  }

  async resize(execId: string, size: { cols: number; rows: number }): Promise<void> {
    await this.containers.resizeExec(execId, size);
  }

  async putArchive(
    workspaceId: string,
    data: Buffer | NodeJS.ReadableStream,
    options: { path?: string } = { path: '/tmp' },
  ): Promise<void> {
    const path = options?.path ?? '/tmp';
    await this.containers.putArchive(workspaceId, data, { path });
  }

  async destroyWorkspace(workspaceId: string, options: DestroyWorkspaceOptions = {}): Promise<void> {
    const labels = await this.safeGetLabels(workspaceId);
    const baseLabels = labels ? this.labelsFromInspect(labels) : undefined;
    if (baseLabels) {
      await this.cleanupDinDSidecars(baseLabels, workspaceId).catch(() => undefined);
    }

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

  private buildBaseLabels(key: WorkspaceKey): Record<string, string> {
    const labels: Record<string, string> = { [THREAD_ID_LABEL]: key.threadId };
    if (key.nodeId) labels[NODE_ID_LABEL] = key.nodeId;
    return labels;
  }

  private labelsFromInspect(labels: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    if (labels[THREAD_ID_LABEL]) result[THREAD_ID_LABEL] = labels[THREAD_ID_LABEL];
    if (labels[NODE_ID_LABEL]) result[NODE_ID_LABEL] = labels[NODE_ID_LABEL];
    return result;
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
      if (cl?.[WORKSPACE_ROLE_LABEL] === DOCKER_ROLE_DIND) continue;
      return c;
    }
    return undefined;
  }

  private async shouldRecreateForPlatform(handle: ContainerHandle, key: WorkspaceKey): Promise<boolean> {
    if (!key.platform) return false;
    try {
      const labels = await this.containers.getContainerLabels(handle.id);
      const existing = labels?.[PLATFORM_LABEL];
      return existing !== key.platform;
    } catch {
      return true;
    }
  }

  private async isAttachedToNetwork(containerId: string, networkName: string): Promise<boolean> {
    if (!networkName) return true;
    try {
      const networks = await this.containers.getContainerNetworks(containerId);
      return networks.includes(networkName);
    } catch (err) {
      this.logger.warn('Failed to inspect workspace networks', {
        containerId: containerId.substring(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  private async createWorkspace(
    key: WorkspaceKey,
    spec: WorkspaceSpec,
    workspaceLabels: Record<string, string>,
    networkName: string,
  ): Promise<ContainerHandle> {
    const binds = spec.persistentVolume
      ? [this.volumeBindFor(key.threadId, spec.persistentVolume.mountPath)]
      : undefined;
    const createExtras = this.buildCreateExtras(networkName, spec.network?.aliases, spec.resources);
    const startOptions: ContainerOpts = {
      workingDir: spec.workingDir,
      env: spec.env,
      labels: workspaceLabels,
      platform: key.platform,
      binds,
      ttlSeconds: spec.ttlSeconds ?? DEFAULT_TTL_SECONDS,
      createExtras,
    };
    if (spec.image) startOptions.image = spec.image;
    const container = await this.containers.start(startOptions);
    return container;
  }

  private buildCreateExtras(
    networkName: string,
    aliases: string[] | undefined,
    resources: WorkspaceSpec['resources'] | undefined,
  ): ContainerOpts['createExtras'] | undefined {
    const networking = networkName
      ? {
          NetworkingConfig: {
            EndpointsConfig: {
              [networkName]: aliases && aliases.length > 0 ? { Aliases: aliases } : {},
            },
          },
        }
      : undefined;

    const hostConfig = resources
      ? {
          HostConfig: {
            ...(typeof resources.cpuNano === 'number' ? { NanoCPUs: resources.cpuNano } : {}),
            ...(typeof resources.memoryBytes === 'number' ? { Memory: resources.memoryBytes } : {}),
          },
        }
      : undefined;

    if (networking && hostConfig) {
      return { ...hostConfig, ...networking };
    }
    return hostConfig ?? networking ?? undefined;
  }

  private volumeBindFor(threadId: string, mountPath: string): string {
    const volumeName = `ha_ws_${threadId}`;
    return `${volumeName}:${mountPath}`;
  }

  private async ensureDinD(workspace: ContainerHandle, baseLabels: Record<string, string>, mirrorUrl?: string): Promise<void> {
    const labels = {
      ...baseLabels,
      [WORKSPACE_ROLE_LABEL]: DOCKER_ROLE_DIND,
      [PARENT_CONTAINER_LABEL]: workspace.id,
    } as Record<string, string>;

    let dind = await this.containers.findContainerByLabels(labels);
    if (!dind) {
      dind = await this.containers.start({
        image: DIND_IMAGE,
        env: { DOCKER_TLS_CERTDIR: '' },
        cmd: ['-H', DIND_HOST, '--registry-mirror', mirrorUrl ?? DIND_DEFAULT_MIRROR],
        labels,
        autoRemove: true,
        privileged: true,
        networkMode: `container:${workspace.id}`,
        anonymousVolumes: ['/var/lib/docker'],
      });
    }

    await this.waitForDinDReady(dind);
  }

  private async waitForDinDReady(dind: ContainerHandle): Promise<void> {
    const deadline = Date.now() + 60_000;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    while (Date.now() < deadline) {
      try {
        const { exitCode } = await this.containers.execContainer(dind.id, [
          'sh',
          '-lc',
          `docker -H ${DIND_HOST} info >/dev/null 2>&1`,
        ]);
        if (exitCode === 0) return;
      } catch {
        // ignore exec errors
      }
      await this.failFastIfDinDExited(dind);
      await sleep(1_000);
    }
    throw new Error('dind_not_ready');
  }

  private async failFastIfDinDExited(dind: ContainerHandle): Promise<void> {
    try {
      const docker = this.containers.getDocker();
      const inspect = await docker.getContainer(dind.id).inspect();
      const state = (inspect as { State?: { Running?: boolean; Status?: string } }).State;
      if (state && state.Running === false) {
        throw new Error(`DinD sidecar exited unexpectedly: status=${state.Status}`);
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('DinD sidecar exited unexpectedly');
    }
  }

  private async cleanupDinDSidecars(labels: Record<string, string>, parentId: string): Promise<void> {
    try {
      const dinds = await this.containers.findContainersByLabels({
        ...labels,
        [WORKSPACE_ROLE_LABEL]: DOCKER_ROLE_DIND,
        [PARENT_CONTAINER_LABEL]: parentId,
      });
      await Promise.all(
        dinds.map(async (d) => {
          try {
            await d.stop(5);
          } catch (err) {
            if (!this.isBenignDockerError(err, [304, 404, 409])) throw err;
          }
          try {
            await d.remove(true);
          } catch (err) {
            if (!this.isBenignDockerError(err, [404, 409])) throw err;
          }
        }),
      );
    } catch {
      // ignore lookup errors
    }
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
