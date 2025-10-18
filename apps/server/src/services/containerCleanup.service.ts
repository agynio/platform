import { randomUUID } from 'node:crypto';
import type { ContainerRegistryService } from './containerRegistry.service';
import type { ContainerService } from './container.service';
import { LoggerService } from './logger.service';

export class ContainerCleanupService {
  private timer?: NodeJS.Timeout;
  private enabled: boolean;

  constructor(
    private registry: ContainerRegistryService,
    private containers: ContainerService,
    private logger: LoggerService,
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
    if (!expired.length) return;
    this.logger.info(`ContainerCleanup: found ${expired.length} expired containers`);

    // Controlled concurrency to avoid long sequential sweeps
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(5);

    await Promise.allSettled(
      expired.map((doc) =>
        limit(async () => {
          const id = doc.container_id;
          const claimId = randomUUID();
          // Only CAS-claim when transitioning from running; terminating should be retried idempotently
          if (doc.status === 'running') {
            const ok = await this.registry.claimForTermination(id, claimId);
            if (!ok) return; // claimed by another worker
          }

          try {
            // First, stop and remove any DinD sidecars associated with this workspace container
            try {
              const sidecars = await this.containers.findContainersByLabels(
                { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': id },
                { all: true },
              );
              if (Array.isArray(sidecars) && sidecars.length > 0) {
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
                      return true;
                    } catch (e: unknown) {
                      const code = (e as { statusCode?: number } | undefined)?.statusCode;
                      if (code !== 404 && code !== 409) throw e;
                      return false;
                    }
                  }),
                );
                const scCleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
                if (scCleaned > 0) this.logger.info(`ContainerCleanup: removed ${scCleaned} DinD sidecar(s) for ${id}`);
                const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
                if (rejected.length) {
                  throw new AggregateError(rejected.map((r) => r.reason), 'One or more sidecar cleanup tasks failed');
                }
              }
            } catch (e) {
              this.logger.error('ContainerCleanup: error cleaning DinD sidecars', { id, error: e });
            }
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
            await this.registry.markStopped(id, 'ttl_expired');
          } catch (e) {
            this.logger.error('ContainerCleanup: error stopping/removing', { id, error: e });
            // Schedule retry with backoff metadata; leave as terminating
            await this.registry.recordTerminationFailure(id, e instanceof Error ? e.message : String(e));
          }
        }),
      ),
    );
  }
}
