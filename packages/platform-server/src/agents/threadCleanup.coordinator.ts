import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, RunStatus, ThreadStatus } from '@prisma/client';
import { AgentsPersistenceService } from './agents.persistence.service';
import { ContainerThreadTerminationService } from '../infra/container/containerThreadTermination.service';
import { ContainerCleanupService } from '../infra/container/containerCleanup.job';
import { RunSignalsRegistry } from './run-signals.service';
import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { ContainerRegistry } from '../infra/container/container.registry';
import { ContainerService } from '../infra/container/container.service';
import { THREAD_CLEANUP_OPTIONS, type ThreadCleanupOptions } from './threadCleanup.config';

type ThreadNode = {
  id: string;
  parentId: string | null;
  status: ThreadStatus;
  createdAt: Date;
};

type RunRecord = {
  id: string;
  threadId: string;
  status: RunStatus;
};

@Injectable()
export class ThreadCleanupCoordinator {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(ContainerThreadTerminationService) private readonly termination: ContainerThreadTerminationService,
    @Inject(ContainerCleanupService) private readonly cleanup: ContainerCleanupService,
    @Inject(RunSignalsRegistry) private readonly runSignals: RunSignalsRegistry,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ContainerRegistry) private readonly registry: ContainerRegistry,
    @Inject(ContainerService) private readonly containerService: ContainerService,
    @Inject(THREAD_CLEANUP_OPTIONS) private readonly options: ThreadCleanupOptions,
  ) {}

  async closeThreadWithCascade(threadId: string, override?: Partial<ThreadCleanupOptions>): Promise<void> {
    const opts = { ...this.options, ...(override ?? {}) } satisfies ThreadCleanupOptions;
    try {
      const nodes = await this.collectThreadNodes(threadId, opts.cascade);
      if (!nodes.length) {
        this.logger.warn('ThreadCleanup: no threads found for cleanup', { threadId });
        return;
      }

      for (const node of nodes) {
        await this.processThread(node, opts);
      }
    } catch (error) {
      this.logger.error('ThreadCleanup: fatal error during cascade', { threadId, error });
    }
  }

  private async processThread(node: ThreadNode, opts: ThreadCleanupOptions): Promise<void> {
    const { id: threadId } = node;

    try {
      await this.ensureThreadClosed(node, opts);

      const activeRuns = await this.listRunningRuns(threadId);
      if (activeRuns.length > 0) {
        const shouldContinue = await this.handleActiveRuns(threadId, activeRuns, opts);
        if (!shouldContinue) return;
      }

      if (opts.dryRun) {
        this.logger.info('ThreadCleanup: dry-run mode – skipping container cleanup', { threadId });
        if (opts.deleteVolumes && !opts.keepVolumesForDebug) {
          this.logger.info('ThreadCleanup: dry-run mode – would delete workspace volume', { threadId });
        }
        return;
      }

      await this.termination.terminateByThread(threadId);
      await this.cleanup.sweepSelective(threadId, {
        graceSeconds: opts.graceSeconds,
        force: opts.force,
        deleteEphemeral: opts.deleteEphemeral,
      });

      if (!opts.deleteVolumes) {
        this.logger.info('ThreadCleanup: volume deletion disabled by configuration', { threadId });
        return;
      }
      if (opts.keepVolumesForDebug) {
        this.logger.info('ThreadCleanup: preserving workspace volume for debug', { threadId });
        return;
      }

      await this.deleteWorkspaceVolume(threadId, opts);
    } catch (error) {
      this.logger.error('ThreadCleanup: thread cleanup failed', { threadId, error });
    }
  }

  private async handleActiveRuns(
    threadId: string,
    activeRuns: RunRecord[],
    opts: ThreadCleanupOptions,
  ): Promise<boolean> {
    if (opts.skipActive) {
      this.logger.warn('ThreadCleanup: skipping thread with active runs', {
        threadId,
        activeRuns: activeRuns.map((r) => r.id),
      });
      return false;
    }

    this.logger.info('ThreadCleanup: terminating active runs', { threadId, runCount: activeRuns.length });
    if (opts.dryRun) {
      this.logger.info('ThreadCleanup: dry-run mode – would send terminate signal to runs', {
        threadId,
        runs: activeRuns.map((r) => r.id),
      });
      return true;
    }

    for (const run of activeRuns) this.runSignals.activateTerminate(run.id);
    return true;
  }

  private async ensureThreadClosed(node: ThreadNode, opts: ThreadCleanupOptions): Promise<void> {
    if (node.status === 'closed') return;
    if (opts.dryRun) {
      this.logger.info('ThreadCleanup: dry-run – would close thread', { threadId: node.id });
      return;
    }
    const result = await this.persistence.updateThread(node.id, { status: 'closed' });
    node.status = result.status;
  }

  private async collectThreadNodes(rootId: string, cascade: boolean): Promise<ThreadNode[]> {
    const prisma = this.prisma;
    const root = await prisma.thread.findUnique({
      where: { id: rootId },
      select: { id: true, parentId: true, status: true, createdAt: true },
    });
    if (!root) return [];

    const nodes = new Map<string, ThreadNode>();
    nodes.set(root.id, {
      id: root.id,
      parentId: root.parentId ?? null,
      status: root.status,
      createdAt: root.createdAt,
    });

    if (!cascade) return [nodes.get(root.id)!];

    let frontier: string[] = [root.id];
    while (frontier.length > 0) {
      const children = await prisma.thread.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true, parentId: true, status: true, createdAt: true },
      });
      frontier = [];
      for (const child of children) {
        nodes.set(child.id, {
          id: child.id,
          parentId: child.parentId ?? null,
          status: child.status,
          createdAt: child.createdAt,
        });
        frontier.push(child.id);
      }
    }

    return this.postOrder(nodes, root.id);
  }

  private postOrder(nodes: Map<string, ThreadNode>, rootId: string): ThreadNode[] {
    const children = new Map<string, string[]>();
    for (const node of nodes.values()) {
      if (!node.parentId) continue;
      const list = children.get(node.parentId) ?? [];
      list.push(node.id);
      children.set(node.parentId, list);
    }

    const visited = new Set<string>();
    const order: ThreadNode[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const kids = children.get(id) ?? [];
      for (const kid of kids) visit(kid);
      const node = nodes.get(id);
      if (node) order.push(node);
    };

    visit(rootId);
    return order;
  }

  private async listRunningRuns(threadId: string): Promise<RunRecord[]> {
    const prisma = this.prisma;
    return prisma.run.findMany({
      where: { threadId, status: 'running' },
      select: { id: true, threadId: true, status: true },
    }) as unknown as RunRecord[];
  }

  private async deleteWorkspaceVolume(threadId: string, opts: ThreadCleanupOptions): Promise<void> {
    if (opts.volumeRetentionHours > 0) {
      this.logger.info('ThreadCleanup: skipping volume deletion due to retention window', {
        threadId,
        retentionHours: opts.volumeRetentionHours,
      });
      return;
    }

    const volumeName = `ha_ws_${threadId}`;
    try {
      const dockerContainers = await this.containerService.listContainersByVolume(volumeName);
      if (dockerContainers.length > 0) {
        this.logger.warn('ThreadCleanup: workspace volume still referenced by containers; skipping deletion', {
          threadId,
          volumeName,
          containerCount: dockerContainers.length,
          containerIds: dockerContainers,
        });
        return;
      }

      const registryRefs = await this.registry.findByVolume(volumeName);
      const activeRefs = registryRefs.filter((ref) => ref.threadId !== threadId || ref.status !== 'stopped');
      if (activeRefs.length > 0) {
        this.logger.warn('ThreadCleanup: workspace volume referenced in registry; skipping deletion', {
          threadId,
          volumeName,
          references: activeRefs,
        });
        return;
      }

      await this.containerService.removeVolume(volumeName, { force: true });
      this.logger.info('ThreadCleanup: workspace volume removed', { threadId, volumeName });
    } catch (error) {
      this.logger.error('ThreadCleanup: failed to remove workspace volume', { threadId, volumeName, error });
    }
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
}
