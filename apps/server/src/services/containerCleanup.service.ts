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
            // Try graceful stop then remove (handle benign errors)
            try {
              await this.containers.stopContainer(id, 10);
            } catch (e: unknown) {
              const sc = (e as { statusCode?: number } | undefined)?.statusCode;
              if (sc !== 304 && sc !== 404) throw e;
            }
            try {
              await this.containers.removeContainer(id, true);
            } catch (e: unknown) {
              const sc = (e as { statusCode?: number } | undefined)?.statusCode;
              if (sc !== 404) throw e;
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
