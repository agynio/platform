import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/services/logger.service';
import { Prisma, type PrismaClient } from '@prisma/client';
import { sanitizeContainerMounts, type ContainerMount } from './container.mounts';

export type ContainerStatus = 'running' | 'stopped' | 'terminating' | 'failed';

// Strongly typed metadata stored in JSON column
export interface ContainerMetadata {
  labels: Record<string, string>;
  platform?: string;
  ttlSeconds: number;
  lastError?: string;
  retryAfter?: string; // ISO timestamp
  terminationAttempts?: number;
  claimId?: string;
  mounts?: ContainerMount[];
}

@Injectable()
export class ContainerRegistry {
  constructor(
    private prisma: PrismaClient,
    private logger: LoggerService,
  ) {}

  async ensureIndexes(): Promise<void> {
    // No-op: indexes are managed via Prisma migrations
  }

  private computeKillAfter(lastUsedIso: string, ttlSeconds?: number): string | null {
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : 86400; // default 24h
    if (ttl <= 0) return null;
    const t = new Date(lastUsedIso).getTime() + ttl * 1000;
    return new Date(t).toISOString();
  }

  async registerStart(args: {
    containerId: string;
    nodeId: string;
    threadId: string;
    image: string;
    providerType?: 'docker';
    labels?: Record<string, string>;
    platform?: string;
    ttlSeconds?: number;
    mounts?: ContainerMount[];
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const killAfter = this.computeKillAfter(nowIso, args.ttlSeconds);
    const mounts = sanitizeContainerMounts(args.mounts);
    const metadata: ContainerMetadata = {
      labels: args.labels ?? {},
      platform: args.platform,
      ttlSeconds: typeof args.ttlSeconds === 'number' ? args.ttlSeconds : 86400,
      mounts: mounts.length > 0 ? mounts : undefined,
    };
    await this.prisma.container.upsert({
      where: { containerId: args.containerId },
      create: {
        containerId: args.containerId,
        nodeId: args.nodeId,
        threadId: args.threadId || null,
        providerType: 'docker',
        image: args.image,
        status: 'running',
        lastUsedAt: new Date(nowIso),
        killAfterAt: killAfter ? new Date(killAfter) : null,
        terminationReason: null,
        deletedAt: null,
        // Cast via unknown to satisfy Prisma InputJsonValue
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
      update: {
        nodeId: args.nodeId,
        threadId: args.threadId || null,
        providerType: 'docker',
        image: args.image,
        status: 'running',
        lastUsedAt: new Date(nowIso),
        killAfterAt: killAfter ? new Date(killAfter) : null,
        terminationReason: null,
        deletedAt: null,
        // Cast via unknown to satisfy Prisma InputJsonValue
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateLastUsed(containerId: string, now: Date = new Date(), ttlOverrideSeconds?: number): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return; // do not create missing records
    const meta = this.normalizeMetadata(existing.metadata);
    const ttlMeta = meta.ttlSeconds;
    const ttl = typeof ttlOverrideSeconds === 'number' ? ttlOverrideSeconds : typeof ttlMeta === 'number' ? ttlMeta : 86400;
    const killIso = this.computeKillAfter(now.toISOString(), ttl);
    await this.prisma.container.update({
      where: { containerId },
      data: {
        lastUsedAt: now,
        killAfterAt: killIso ? new Date(killIso) : null,
      },
    });
  }

  async markTerminating(containerId: string, reason: string, claimId?: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    const meta = this.normalizeMetadata(existing.metadata);
    if (claimId) meta.claimId = claimId;
    await this.prisma.container.update({
      where: { containerId },
      data: {
        status: 'terminating',
        terminationReason: reason,
        // Cast via unknown to satisfy Prisma InputJsonValue
        metadata: meta as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async markStopped(containerId: string, reason: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    await this.prisma.container.update({
      where: { containerId },
      data: { status: 'stopped', deletedAt: new Date(), terminationReason: reason },
    });
  }

  async claimForTermination(containerId: string, claimId: string): Promise<boolean> {
    const currentMeta = await this.getMetadata(containerId);
    const nextMeta: ContainerMetadata = { ...currentMeta, claimId };
    const res = await this.prisma.container.updateMany({
      where: { containerId, status: 'running' },
      data: { status: 'terminating', metadata: nextMeta as unknown as Prisma.InputJsonValue },
    });
    return res.count === 1;
  }

  private async getMetadata(containerId: string): Promise<ContainerMetadata> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    return this.normalizeMetadata(existing?.metadata);
  }

  // Narrow unknown JSON to typed ContainerMetadata with defaults
  private normalizeMetadata(meta: unknown): ContainerMetadata {
    const m = (typeof meta === 'object' && meta !== null) ? (meta as Record<string, unknown>) : {};
    const labels = typeof m.labels === 'object' && m.labels !== null ? (m.labels as Record<string, string>) : {};
    const platform = typeof m.platform === 'string' ? m.platform : undefined;
    const ttlSeconds = typeof m.ttlSeconds === 'number' ? m.ttlSeconds : 86400;
    const lastError = typeof m.lastError === 'string' ? m.lastError : undefined;
    const retryAfter = typeof m.retryAfter === 'string' ? m.retryAfter : undefined;
    const terminationAttempts = typeof m.terminationAttempts === 'number' ? m.terminationAttempts : undefined;
    const claimId = typeof m.claimId === 'string' ? m.claimId : undefined;
    const mounts = sanitizeContainerMounts(m.mounts);
    return { labels, platform, ttlSeconds, lastError, retryAfter, terminationAttempts, claimId, mounts: mounts.length ? mounts : undefined };
  }

  async getExpired(now: Date = new Date()) {
    const iso = now.toISOString();
    // Include terminating containers with no retryAfter or retryAfter <= now; exclude future retryAfter
    const q = Prisma.sql`
      SELECT "containerId" FROM "Container"
      WHERE "status" = 'terminating'
        AND (
          NOT ("metadata" ? 'retryAfter')
          OR (("metadata"->>'retryAfter')::timestamptz <= ${iso}::timestamptz)
        )
    `;
    const terminating = await this.prisma.$queryRaw<Array<{ containerId: string }>>(q);
    const running = await this.prisma.container.findMany({
      where: { status: 'running', killAfterAt: { not: null, lte: now } },
    });
    const termDetails = await this.prisma.container.findMany({ where: { containerId: { in: terminating.map(({ containerId }) => containerId) } } });
    return [...running, ...termDetails];
  }

  async recordTerminationFailure(containerId: string, message: string): Promise<void> {
    const existing = await this.prisma.container.findUnique({ where: { containerId } });
    if (!existing) return;
    const meta = this.normalizeMetadata(existing.metadata);
    const attempts = typeof meta.terminationAttempts === 'number' ? meta.terminationAttempts : 0;
    const nextAttempts = attempts + 1;
    const delayMs = Math.min(Math.pow(2, attempts) * 1000, 15 * 60 * 1000);
    const retryAfterIso = new Date(Date.now() + delayMs).toISOString();
    meta.lastError = message;
    meta.retryAfter = retryAfterIso;
    meta.terminationAttempts = nextAttempts;
    await this.prisma.container.update({ where: { containerId }, data: { metadata: meta as unknown as Prisma.InputJsonValue } });
  }
}
