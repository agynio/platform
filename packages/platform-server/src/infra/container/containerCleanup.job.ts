import { randomUUID } from 'node:crypto';
import { ContainerRegistry as ContainerRegistryService } from './container.registry';
import { ContainerService } from './container.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';

export interface SweepSelectiveOptions {
  graceSeconds: number;
  force: boolean;
  deleteEphemeral: boolean;
}

@Injectable()
export class ContainerCleanupService {
  private timer?: NodeJS.Timeout;
  private enabled: boolean;
  private readonly logger = new Logger(ContainerCleanupService.name);

  constructor(
    @Inject(ContainerRegistryService) private registry: ContainerRegistryService,
    @Inject(ContainerService) private containers: ContainerService,
  ) {
    const env = process.env.CONTAINERS_CLEANUP_ENABLED;
    this.enabled = env == null ? true : String(env).toLowerCase() === 'true';
  }

  start(intervalMs = 5 * 60 * 1000): void {
    if (!this.enabled) {
      this.logger.log('ContainerCleanup: disabled by CONTAINERS_CLEANUP_ENABLED');
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
    this.logger.log('ContainerCleanup: started background sweeper');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async sweep(now: Date = new Date()): Promise<void> {
    const expired = await this.registry.getExpired(now);
    if (!expired.length) return;
    this.logger.log(`ContainerCleanup: found ${expired.length} expired containers`);

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

          try {
            await this.cleanDinDSidecars(id, { graceSeconds: 5, removeVolumes: true }).catch((e: unknown) =>
              this.logger.error('ContainerCleanup: error cleaning DinD sidecars', { id, error: e }),
            );
            await this.stopAndRemoveContainer(id, { graceSeconds: 10, force: true });
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

  async sweepSelective(threadId: string, opts: SweepSelectiveOptions): Promise<void> {
    const records = await this.registry.listByThread(threadId);
    if (!records.length) {
      this.logger.log('ContainerCleanup: no containers found for selective sweep', { threadId });
      return;
    }

    const seen = new Set<string>();
    const parentIds: string[] = [];
    for (const record of records) {
      if (seen.has(record.containerId)) continue;
      seen.add(record.containerId);
      parentIds.push(record.containerId);
    }

    const sidecarsByParent = new Map<string, string[]>();
    for (const parent of parentIds) {
      const handles = await this.containers.findContainersByLabels(
        { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': parent },
        { all: true },
      );
      if (!handles.length) continue;
      sidecarsByParent.set(parent, handles.map((h) => h.id));
    }

    for (const [parentId, sidecars] of sidecarsByParent.entries()) {
      for (const sidecarId of sidecars) {
        try {
          await this.stopAndRemoveContainer(sidecarId, {
            graceSeconds: opts.graceSeconds,
            force: true,
            removeVolumes: opts.deleteEphemeral,
          });
        } catch (error) {
          this.logger.error('ContainerCleanup: failed to clean DinD sidecar during selective sweep', {
            threadId,
            parentId,
            sidecarId,
            error,
          });
        }
      }
    }

    for (const record of records) {
      try {
        await this.stopAndRemoveContainer(record.containerId, {
          graceSeconds: opts.graceSeconds,
          force: opts.force,
        });
        await this.registry.markStopped(record.containerId, 'thread_closed');
      } catch (error) {
        await this.registry.recordTerminationFailure(
          record.containerId,
          error instanceof Error ? error.message : String(error),
        );
        this.logger.error('ContainerCleanup: failed selective cleanup for container', {
          threadId,
          containerId: record.containerId,
          error,
        });
      }
    }
  }

  /** Stop and remove any DinD sidecars associated with a workspace container. */
  private async cleanDinDSidecars(
    parentId: string,
    options: { graceSeconds: number; removeVolumes: boolean },
  ): Promise<void> {
    const sidecars = await this.containers.findContainersByLabels(
      { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': parentId },
      { all: true },
    );
    if (!Array.isArray(sidecars) || sidecars.length === 0) return;
    const results = await Promise.allSettled(
      sidecars.map(async (sc) => {
        await this.stopAndRemoveContainer(sc.id, {
          graceSeconds: options.graceSeconds,
          force: true,
          removeVolumes: options.removeVolumes,
        });
        return true as const;
      }),
    );
    const scCleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
    if (scCleaned > 0) this.logger.log(`ContainerCleanup: removed ${scCleaned} DinD sidecar(s) for ${parentId}`);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length) throw new AggregateError(rejected.map((r) => r.reason), 'One or more sidecar cleanup tasks failed');
  }

  private async stopAndRemoveContainer(
    containerId: string,
    options: { graceSeconds: number; force: boolean; removeVolumes?: boolean },
  ): Promise<void> {
    try {
      await this.containers.stopContainer(containerId, options.graceSeconds);
    } catch (e: unknown) {
      const sc = (e as { statusCode?: number } | undefined)?.statusCode;
      if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
      this.logger.debug(`ContainerCleanup: benign stop error status=${sc} id=${containerId}`);
    }
    try {
      await this.containers.removeContainer(containerId, {
        force: options.force,
        removeVolumes: options.removeVolumes ?? false,
      });
    } catch (e: unknown) {
      const sc = (e as { statusCode?: number } | undefined)?.statusCode;
      if (sc !== 404 && sc !== 409) throw e;
      this.logger.debug(`ContainerCleanup: benign remove error status=${sc} id=${containerId}`);
    }
  }
}
