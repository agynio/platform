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
            await cleanupSidecars(this.containers, id, this.logger);
            await this.safeStop(id);
            await this.safeRemove(id);
            await this.registry.markStopped(id, 'ttl_expired');
          } catch (e) {
            this.logger.error('ContainerCleanup: error stopping/removing', { id, error: e });
            await this.registry.recordTerminationFailure(id, e instanceof Error ? e.message : String(e));
          }
        }),
      ),
    );
  }

  private async safeStop(id: string): Promise<void> {
    await benign(
      () => this.containers.stopContainer(id, 10),
      [304, 404, 409],
      (sc) => this.logger.debug(`ContainerCleanup: benign stop error status=${sc} id=${id}`),
    );
  }

  private async safeRemove(id: string): Promise<void> {
    await benign(
      () => this.containers.removeContainer(id, true),
      [404, 409],
      (sc) => this.logger.debug(`ContainerCleanup: benign remove error status=${sc} id=${id}`),
    );
  }
}

async function benign<T>(op: () => Promise<T>, allowed: number[], onBenign?: (code?: number) => void): Promise<T | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/return-await
    return await op();
  } catch (e: unknown) {
    const code = (e as { statusCode?: number } | undefined)?.statusCode;
    if (!allowed.includes(code ?? -1)) throw e;
    onBenign?.(code);
    return undefined;
  }
}

// Sidecar cleanup for a parent container id
async function cleanupSidecars(containers: ContainerService, id: string, logger: LoggerService): Promise<void> {
  try {
    const sidecars = await containers.findContainersByLabels(
      { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': id },
      { all: true },
    );
    if (!Array.isArray(sidecars) || sidecars.length === 0) return;
    const results = await Promise.allSettled(sidecars.map((sc) => safeStopAndRemove(sc)));
    const scCleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
    if (scCleaned > 0) logger.info(`ContainerCleanup: removed ${scCleaned} DinD sidecar(s) for ${id}`);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length) throw new AggregateError(rejected.map((r) => r.reason), 'One or more sidecar cleanup tasks failed');
  } catch (e) {
    logger.error('ContainerCleanup: error cleaning DinD sidecars', { id, error: e });
  }
}

async function safeStopAndRemove(sc: { stop: (t: number) => Promise<void>; remove: (f: boolean) => Promise<void> }): Promise<boolean> {
  try { await sc.stop(5); } catch (e: unknown) {
    const code = (e as { statusCode?: number } | undefined)?.statusCode;
    if (code !== 304 && code !== 404 && code !== 409) throw e;
  }
  try { await sc.remove(true); return true; } catch (e: unknown) {
    const code = (e as { statusCode?: number } | undefined)?.statusCode;
    if (code !== 404 && code !== 409) throw e;
    return false;
  }
}
