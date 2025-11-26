import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ContainerRegistry, type ContainerMetadata, type ContainerStatus } from './container.registry';
import { ContainerService } from './container.service';
import { PrismaService } from '../../core/services/prisma.service';
import { ContainerHandle } from './container.handle';

@Injectable()
export class ContainerThreadTerminationService {
  private readonly logger = new Logger(ContainerThreadTerminationService.name);

  constructor(
    @Inject(ContainerRegistry) private readonly registry: ContainerRegistry,
    @Inject(ContainerService) private readonly containerService: ContainerService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async terminateByThread(threadId: string, options?: { synchronous?: boolean }): Promise<void> {
    const run = async () => {
      try {
        await this.terminateThreadContainers(threadId);
      } catch (error: unknown) {
        this.logger.error('ContainerThreadTermination: unexpected error', { threadId, error });
      }
    };

    if (options?.synchronous === false) {
      setImmediate(() => {
        run().catch((error: unknown) =>
          this.logger.error('ContainerThreadTermination: background task failed', { threadId, error }),
        );
      });
      return;
    }

    await run();
  }

  private async terminateThreadContainers(threadId: string): Promise<void> {
    const prisma = this.prisma;
    const initial = await prisma.container.findMany({
      where: { threadId, status: { in: ['running', 'terminating'] } },
      select: { containerId: true, status: true, metadata: true },
    });

    const cache = new Map<string, { status: ContainerStatus; metadata: ContainerMetadata }>();
    const pendingIds = new Set<string>();

    for (const row of initial) {
      cache.set(row.containerId, { status: row.status, metadata: this.normalizeMetadata(row.metadata) });
      pendingIds.add(row.containerId);
    }

    const discovered = await this.safeFindContainersByThread(threadId);
    for (const handle of discovered) pendingIds.add(handle.id);

    const queue = [...pendingIds];
    const processed = new Set<string>();
    const nowIso = new Date().toISOString();

    while (queue.length) {
      const containerId = queue.shift();
      if (!containerId) continue;
      if (processed.has(containerId)) continue;

      await this.processContainer(containerId, {
        threadId,
        cache,
        pendingIds,
        processed,
        queue,
        nowIso,
        prisma,
      });
    }
  }

  private async processContainer(
    containerId: string,
    context: {
      threadId: string;
      cache: Map<string, { status: ContainerStatus; metadata: ContainerMetadata }>;
      pendingIds: Set<string>;
      processed: Set<string>;
      queue: string[];
      nowIso: string;
      prisma: PrismaClient;
    },
  ): Promise<void> {
    const { threadId, cache, pendingIds, processed, queue, nowIso, prisma } = context;
    const record = await this.ensureRegistryRecord(containerId, threadId, cache);
    if (!record) {
      processed.add(containerId);
      return;
    }

    let claimId: string | undefined;
    if (record.status === 'running') {
      const candidate = randomUUID();
      try {
        const claimed = await this.registry.claimForTermination(containerId, candidate);
        if (claimed) claimId = candidate;
      } catch (error: unknown) {
        this.logger.error('ContainerThreadTermination: claim failed', { threadId, containerId, error });
      }
    }

    const refreshed = await prisma.container.findUnique({
      where: { containerId },
      select: { status: true, metadata: true },
    });
    const metadata = this.normalizeMetadata(refreshed?.metadata ?? record.metadata);
    if (claimId) metadata.claimId = claimId;
    metadata.retryAfter = nowIso;

    try {
      await prisma.container.update({
        where: { containerId },
        data: {
          status: 'terminating',
          terminationReason: 'thread_closed',
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(
        `ContainerThreadTermination: thread=${threadId} container=${this.shortId(containerId)} marked terminating (claim=${claimId ? 'acquired' : 'skipped'})`,
      );
    } catch (error: unknown) {
      this.logger.error('ContainerThreadTermination: failed to update container', { threadId, containerId, error });
    }

    processed.add(containerId);

    const sidecars = await this.safeFindDinDSidecars(containerId);
    for (const sc of sidecars) {
      if (pendingIds.has(sc)) {
        if (!processed.has(sc) && !queue.includes(sc)) queue.push(sc);
        continue;
      }
      pendingIds.add(sc);
      queue.push(sc);
    }
  }

  private async ensureRegistryRecord(
    containerId: string,
    threadId: string,
    cache: Map<string, { status: ContainerStatus; metadata: ContainerMetadata }>,
  ): Promise<{ status: ContainerStatus; metadata: ContainerMetadata } | null> {
    const cached = cache.get(containerId);
    if (cached) return cached;

    const prisma = this.prisma;
    const found = await prisma.container.findUnique({
      where: { containerId },
      select: { status: true, metadata: true },
    });
    if (found) {
      const normalized = { status: found.status, metadata: this.normalizeMetadata(found.metadata) };
      cache.set(containerId, normalized);
      return normalized;
    }

    return null;
  }

  private async safeFindContainersByThread(threadId: string): Promise<ContainerHandle[]> {
    try {
      return await this.containerService.findContainersByLabels({ 'hautech.ai/thread_id': threadId }, { all: true });
    } catch (error: unknown) {
      this.logger.error('ContainerThreadTermination: failed to list containers by thread label', { threadId, error });
      return [];
    }
  }

  private async safeFindDinDSidecars(containerId: string): Promise<string[]> {
    try {
      const handles = await this.containerService.findContainersByLabels(
        { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': containerId },
        { all: true },
      );
      return handles.map((h) => h.id);
    } catch (error: unknown) {
      this.logger.error('ContainerThreadTermination: failed to list DinD sidecars', { containerId, error });
      return [];
    }
  }

  private normalizeMetadata(meta: unknown): ContainerMetadata {
    if (typeof meta !== 'object' || meta === null) return { labels: {}, ttlSeconds: 86400 };
    const obj = meta as Record<string, unknown>;
    const labelsRaw = obj.labels;
    const labels: Record<string, string> = {};
    if (typeof labelsRaw === 'object' && labelsRaw !== null) {
      for (const [k, v] of Object.entries(labelsRaw as Record<string, unknown>)) {
        if (typeof v === 'string') labels[k] = v;
      }
    }
    const platform = typeof obj.platform === 'string' ? obj.platform : undefined;
    const ttlSeconds = typeof obj.ttlSeconds === 'number' ? obj.ttlSeconds : 86400;
    const lastError = typeof obj.lastError === 'string' ? obj.lastError : undefined;
    const retryAfter = typeof obj.retryAfter === 'string' ? obj.retryAfter : undefined;
    const terminationAttempts = typeof obj.terminationAttempts === 'number' ? obj.terminationAttempts : undefined;
    const claimId = typeof obj.claimId === 'string' ? obj.claimId : undefined;
    return { labels, platform, ttlSeconds, lastError, retryAfter, terminationAttempts, claimId };
  }

  private shortId(id: string): string {
    return id.length <= 12 ? id : id.slice(0, 12);
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
}
