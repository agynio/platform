import { Inject, Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { PrismaService } from '../../core/services/prisma.service';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { DockerRunnerStatusService } from './dockerRunnerStatus.service';
import { ConfigService } from '../../core/services/config.service';

const DEFAULT_ENABLED = true;
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_PER_SWEEP = 100;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_TIMEOUT_MS = 15_000;
const SWEEP_TIMEOUT_ERROR = 'VOLUME_GC_SWEEP_TIMEOUT';

type SweepOutcome = 'removed' | 'referenced' | 'cooldown' | 'error' | 'not_found';

@Injectable()
export class VolumeGcService {
  private readonly logger = new Logger(VolumeGcService.name);
  private readonly enabled: boolean;
  private readonly maxPerSweep: number;
  private readonly concurrency: number;
  private readonly cooldownMs: number;
  private readonly sweepTimeoutMs: number;
  private readonly lastAttempt = new Map<string, number>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(DOCKER_CLIENT) private readonly containerService: DockerClient,
    private readonly dockerRunnerStatus: DockerRunnerStatusService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.enabled = this.resolveBoolean(process.env.VOLUME_GC_ENABLED, DEFAULT_ENABLED);
    this.maxPerSweep = this.resolveInteger(process.env.VOLUME_GC_MAX_PER_SWEEP, DEFAULT_MAX_PER_SWEEP);
    this.concurrency = this.resolveInteger(process.env.VOLUME_GC_CONCURRENCY, DEFAULT_CONCURRENCY, 1);
    this.cooldownMs = this.resolveInteger(process.env.VOLUME_GC_COOLDOWN_MS, DEFAULT_COOLDOWN_MS, 0);
    this.sweepTimeoutMs = this.resolveInteger(
      process.env.VOLUME_GC_SWEEP_TIMEOUT_MS,
      this.configService.getVolumeGcSweepTimeoutMs() ?? DEFAULT_SWEEP_TIMEOUT_MS,
      0,
    );
  }

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (!this.enabled) {
      this.logger.log('VolumeGC: disabled by VOLUME_GC_ENABLED');
      return;
    }

    const run = async () => {
      try {
        const completed = await this.sweepWithTimeout();
        if (!completed) {
          this.logger.warn(
            `VolumeGC: sweep timed out after ${this.sweepTimeoutMs}ms; scheduling next run`,
          );
        }
      } catch (error) {
        this.logger.error('VolumeGC: sweep failed', error as Error);
      } finally {
        this.timer = setTimeout(run, intervalMs);
      }
    };

    // Kick off initial sweep shortly after start.
    this.timer = setTimeout(run, Math.min(5_000, intervalMs));
    this.logger.log(`VolumeGC: started background sweeper intervalMs=${intervalMs}`);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async sweep(now: Date = new Date()): Promise<void> {
    if (!this.enabled) return;

    const runnerSnapshot = this.dockerRunnerStatus.getSnapshot();
    if (runnerSnapshot.status !== 'up') {
      this.logger.warn(
        `VolumeGC: skipping sweep because docker runner is ${runnerSnapshot.status ?? 'unknown'}`,
      );
      return;
    }

    const prisma = this.prisma;
    const candidates = await prisma.thread.findMany({
      where: { status: 'closed' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: this.maxPerSweep,
    });

    if (!candidates.length) {
      this.logger.debug('VolumeGC: no closed threads found for sweep');
      return;
    }

    const limit = pLimit(this.concurrency);
    const counts: Record<SweepOutcome, number> = {
      removed: 0,
      referenced: 0,
      cooldown: 0,
      error: 0,
      not_found: 0,
    };
    const nowMs = now.getTime();

    await Promise.allSettled(
      candidates.map(({ id }) =>
        limit(async () => {
          const outcome = await this.handleThread(id, nowMs);
          counts[outcome] += 1;
        }),
      ),
    );

    this.logger.log(
      `VolumeGC: sweep complete${this.format({ total: candidates.length, removed: counts.removed, referenced: counts.referenced, cooldown: counts.cooldown, errors: counts.error })}`,
    );
  }

  private async sweepWithTimeout(): Promise<boolean> {
    if (this.sweepTimeoutMs <= 0) {
      await this.sweep();
      return true;
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(SWEEP_TIMEOUT_ERROR)), this.sweepTimeoutMs);
    });

    try {
      await Promise.race([this.sweep(), timeoutPromise]);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === SWEEP_TIMEOUT_ERROR) {
        return false;
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async handleThread(threadId: string, nowMs: number): Promise<SweepOutcome> {
    const last = this.lastAttempt.get(threadId);
    if (typeof last === 'number' && nowMs - last < this.cooldownMs) {
      return 'cooldown';
    }

    this.lastAttempt.set(threadId, nowMs);

    const volumeName = `ha_ws_${threadId}`;

    try {
      const containers = await this.containerService.listContainersByVolume(volumeName);
      if (containers.length > 0) {
        this.logger.debug(
          `VolumeGC: skipping volume due to live references${this.format({ threadId, volumeName, containerCount: containers.length })}`,
        );
        return 'referenced';
      }

      try {
        await this.containerService.removeVolume(volumeName, { force: true });
        this.logger.log(
          `VolumeGC: removed workspace volume${this.format({ threadId, volumeName })}`,
        );
        return 'removed';
      } catch (error) {
        const statusCode = this.extractStatusCode(error);
        if (statusCode === 404) {
          this.logger.debug(`VolumeGC: volume already missing${this.format({ threadId, volumeName })}`);
          return 'not_found';
        }

        this.logger.error(`VolumeGC: failed removing volume${this.format({ threadId, volumeName, error })}`);
        return 'error';
      }
    } catch (error) {
      this.logger.error(`VolumeGC: failed listing containers for volume${this.format({ threadId, volumeName, error })}`);
      return 'error';
    }
  }

  private resolveBoolean(input: string | undefined, defaultValue: boolean): boolean {
    if (input == null) return defaultValue;
    const normalized = input.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return defaultValue;
  }

  private resolveInteger(input: string | undefined, defaultValue: number, min = 1): number {
    const parsed = Number.parseInt(String(input ?? '').trim(), 10);
    if (Number.isFinite(parsed) && parsed >= min) {
      return parsed;
    }
    return defaultValue;
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (typeof error === 'object' && error && 'statusCode' in error) {
      return Number((error as { statusCode?: number }).statusCode);
    }
    return undefined;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private get prisma() {
    return this.prismaService.getClient();
  }
}
