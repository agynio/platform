import { randomUUID } from 'node:crypto';
import { ContainerRegistry as ContainerRegistryService } from './container.registry';
import { ContainerService } from './container.service';
import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/services/logger.service';
import pLimit from 'p-limit';
import { ConfigService } from '../../core/services/config.service';
import { NODE_LABEL, ROLE_LABEL, THREAD_LABEL, WORKSPACE_VOLUME_LABEL } from '../../constants';

@Injectable()
export class ContainerCleanupService {
  private timer?: NodeJS.Timeout;
  private enabled: boolean;

  constructor(
    @Inject(ContainerRegistryService) private registry: ContainerRegistryService,
    @Inject(ContainerService) private containers: ContainerService,
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const env = process.env.CONTAINERS_CLEANUP_ENABLED;
    this.enabled = env == null ? true : String(env).toLowerCase() === 'true';
  }

  start(intervalMs = 5 * 60 * 1000): void {
    if (!this.enabled) {
      this.logger.info('ContainerCleanup: disabled by CONTAINERS_CLEANUP_ENABLED');
      return;
    }
    const run = async () => {
      try {
        await this.sweep();
      } catch (e) {
        this.logger.error('ContainerCleanup: sweep error', e);
      } finally {
        this.timer = setTimeout(run, intervalMs);
      }
    };
    // initial sweep soon after start
    this.timer = setTimeout(run, 5_000);
    this.logger.info('ContainerCleanup: started background sweeper');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async sweep(now: Date = new Date()): Promise<void> {
    const expired = await this.registry.getExpired(now);
    if (expired.length) {
      this.logger.info(`ContainerCleanup: found ${expired.length} expired containers`);

      // Controlled concurrency to avoid long sequential sweeps
      const limit = pLimit(5);

      await Promise.allSettled(
        expired.map((doc) =>
          limit(async () => {
            // Use camelCase Prisma field names (containerId)
            const id = doc.containerId;
            const claimId = randomUUID();
            // Only CAS-claim when transitioning from running; terminating should be retried idempotently
            if (doc.status === 'running') {
              const ok = await this.registry.claimForTermination(id, claimId);
              if (!ok) return; // claimed by another worker
            }

            const registryLabels = this.extractLabels((doc as { metadata?: unknown })?.metadata);
            let inspectedLabels: Record<string, string> | undefined;
            try {
              inspectedLabels = await this.containers.getContainerLabels(id);
            } catch (e) {
              this.logger.debug(
                `ContainerCleanup: unable to inspect labels for ${id.substring(0, 12)} ${(e as Error)?.message ?? e}`,
              );
            }
            const effectiveLabels =
              inspectedLabels && Object.keys(inspectedLabels).length > 0 ? inspectedLabels : registryLabels;
            const threadId =
              typeof (doc as { threadId?: unknown }).threadId === 'string'
                ? ((doc as { threadId?: unknown }).threadId as string)
                : undefined;
            const nodeIdFromDoc =
              typeof (doc as { nodeId?: unknown }).nodeId === 'string'
                ? ((doc as { nodeId?: unknown }).nodeId as string)
                : undefined;
            const nodeId = effectiveLabels?.[NODE_LABEL] ?? registryLabels?.[NODE_LABEL] ?? nodeIdFromDoc;
            const isWorkspaceContainer =
              (effectiveLabels?.[ROLE_LABEL] ?? registryLabels?.[ROLE_LABEL]) === 'workspace';
            const volumeLabelName = effectiveLabels?.[WORKSPACE_VOLUME_LABEL];
            const derivedVolumeName =
              !volumeLabelName && threadId ? `${this.configService.workspaceVolumePrefix}${threadId}` : undefined;
            const volumeContext = {
              isWorkspace: isWorkspaceContainer,
              volumeName: volumeLabelName ?? derivedVolumeName,
              threadId,
              nodeId,
            };

            try {
              await this.cleanDinDSidecars(id).catch((e: unknown) =>
                this.logger.error('ContainerCleanup: error cleaning DinD sidecars', { id, error: e }),
              );
              // Try graceful stop then remove (handle benign errors)
              try {
                await this.containers.stopContainer(id, 10);
              } catch (e: unknown) {
                const sc = (e as { statusCode?: number } | undefined)?.statusCode;
                // Treat 304 (already stopped), 404 (gone), and 409 (removal in progress) as benign
                if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
                this.logger.debug(`ContainerCleanup: benign stop error status=${sc} id=${id}`);
              }
              try {
                await this.containers.removeContainer(id, true);
              } catch (e: unknown) {
                const sc = (e as { statusCode?: number } | undefined)?.statusCode;
                // Treat 404 (already removed) and 409 (removal in progress) as benign
                if (sc !== 404 && sc !== 409) throw e;
                this.logger.debug(`ContainerCleanup: benign remove error status=${sc} id=${id}`);
              }
              if (volumeContext.isWorkspace && volumeContext.volumeName) {
                await this.deleteWorkspaceVolumeIfSafe({
                  volumeName: volumeContext.volumeName,
                  threadId: volumeContext.threadId,
                  nodeId: volumeContext.nodeId,
                });
              }
              await this.registry.markStopped(id, 'ttl_expired');
            } catch (e: unknown) {
              this.logger.error('ContainerCleanup: error stopping/removing', { id, error: e });
              // Schedule retry with backoff metadata; leave as terminating
              await this.registry.recordTerminationFailure(id, e instanceof Error ? e.message : String(e));
            }
          }),
        ),
      );
    }
    await this.sweepOrphanWorkspaceVolumes();
  }

  private extractLabels(meta: unknown): Record<string, string> {
    if (!meta || typeof meta !== 'object') return {};
    const obj = meta as Record<string, unknown>;
    const raw = obj.labels;
    if (!raw || typeof raw !== 'object') return {};
    const labels: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string') labels[key] = value;
    }
    return labels;
  }

  private async deleteWorkspaceVolumeIfSafe(context: {
    volumeName: string;
    threadId?: string;
    nodeId?: string;
  }): Promise<void> {
    const { volumeName, threadId, nodeId } = context;
    try {
      const containersUsing = await this.containers.listContainersUsingVolume(volumeName);
      if (containersUsing.length > 0) {
        this.logger.info(
          `ContainerCleanup: volume ${volumeName} still in use by ${containersUsing.length} container(s); skipping removal`,
        );
        return;
      }
      const filters: Record<string, string> = { [ROLE_LABEL]: 'workspace_volume' };
      if (threadId) filters[THREAD_LABEL] = threadId;
      if (nodeId) filters[NODE_LABEL] = nodeId;
      const volumes = await this.containers.findVolumesByLabels(filters);
      const target = volumes.find((v) => v.Name === volumeName);
      if (!target) {
        this.logger.debug(`ContainerCleanup: volume ${volumeName} missing managed labels; skipping removal`);
        return;
      }
      await this.containers.removeVolume(volumeName, false);
      this.logger.info(`ContainerCleanup: removed workspace volume name=${volumeName}`);
    } catch (e) {
      this.logger.error('ContainerCleanup: failed to remove workspace volume', { volumeName, error: e });
    }
  }

  private async sweepOrphanWorkspaceVolumes(): Promise<void> {
    try {
      const volumes = await this.containers.findVolumesByLabels({ [ROLE_LABEL]: 'workspace_volume' });
      if (!Array.isArray(volumes) || volumes.length === 0) return;
      let removed = 0;
      for (const vol of volumes) {
        const name = vol?.Name;
        if (!name) continue;
        const inUse = await this.containers.listContainersUsingVolume(name);
        if (inUse.length > 0) continue;
        await this.containers.removeVolume(name, false);
        removed += 1;
      }
      if (removed > 0) {
        this.logger.info(`ContainerCleanup: removed ${removed} orphan workspace volume(s)`);
      }
    } catch (e) {
      this.logger.error('ContainerCleanup: orphan volume sweep failed', e);
    }
  }

  /** Stop and remove any DinD sidecars associated with a workspace container. */
  private async cleanDinDSidecars(parentId: string): Promise<void> {
    const sidecars = await this.containers.findContainersByLabels(
      { [ROLE_LABEL]: 'dind', 'hautech.ai/parent_cid': parentId },
      { all: true },
    );
    if (!Array.isArray(sidecars) || sidecars.length === 0) return;
    const results = await Promise.allSettled(
      sidecars.map(async (sc) => {
        try {
          await sc.stop(5);
        } catch (e: unknown) {
          const code = (e as { statusCode?: number } | undefined)?.statusCode;
          if (code !== 304 && code !== 404 && code !== 409) throw e;
        }
        try {
          await sc.remove(true);
          return true as const;
        } catch (e: unknown) {
          const code = (e as { statusCode?: number } | undefined)?.statusCode;
          if (code !== 404 && code !== 409) throw e;
          return false as const;
        }
      }),
    );
    const scCleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
    if (scCleaned > 0) this.logger.info(`ContainerCleanup: removed ${scCleaned} DinD sidecar(s) for ${parentId}`);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length) throw new AggregateError(rejected.map((r) => r.reason), 'One or more sidecar cleanup tasks failed');
  }
}
