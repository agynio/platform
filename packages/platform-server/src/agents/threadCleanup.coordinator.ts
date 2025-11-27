import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, Prisma, ThreadStatus } from '@prisma/client';
import { AgentsPersistenceService } from './agents.persistence.service';
import { ContainerThreadTerminationService } from '../infra/container/containerThreadTermination.service';
import { ContainerCleanupService } from '../infra/container/containerCleanup.job';
import { RunSignalsRegistry } from './run-signals.service';
import { PrismaService } from '../core/services/prisma.service';
import { ContainerRegistry } from '../infra/container/container.registry';
import { ContainerService } from '../infra/container/container.service';
import { RemindersService } from './reminders.service';
import { EventsBusService } from '../events/events-bus.service';

type ThreadNode = {
  id: string;
  parentId: string | null;
  status: ThreadStatus;
  createdAt: Date;
};

type RunRecord = Prisma.RunGetPayload<{ select: { id: true; threadId: true; status: true } }>;

const STOP_GRACE_SECONDS = 10;
const FORCE_REMOVE_CONTAINERS = true;
const DELETE_EPHEMERAL_VOLUMES = true;

@Injectable()
export class ThreadCleanupCoordinator {
  private readonly logger = new Logger(ThreadCleanupCoordinator.name);
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(ContainerThreadTerminationService) private readonly termination: ContainerThreadTerminationService,
    @Inject(ContainerCleanupService) private readonly cleanup: ContainerCleanupService,
    @Inject(RunSignalsRegistry) private readonly runSignals: RunSignalsRegistry,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ContainerRegistry) private readonly registry: ContainerRegistry,
    @Inject(ContainerService) private readonly containerService: ContainerService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  async closeThreadWithCascade(threadId: string): Promise<void> {
    try {
      const nodes = await this.collectThreadNodes(threadId);
      if (!nodes.length) {
        this.logger.warn(`ThreadCleanup: no threads found for cleanup${this.format({ threadId })}`);
        return;
      }

      this.logger.log(
        `ThreadCleanup: collected subtree for closure${this.format({ threadId, threadCount: nodes.length })}`,
      );

      for (const node of nodes) {
        await this.ensureThreadClosed(node);
      }

      for (const node of nodes) {
        await this.runCleanupPipeline(node);
      }
    } catch (error) {
      this.logger.error(`ThreadCleanup: fatal error during cascade${this.format({ threadId, error })}`);
    }
  }

  private async runCleanupPipeline(node: ThreadNode): Promise<void> {
    const { id: threadId } = node;

    this.logger.log(`ThreadCleanup: pipeline start${this.format({ threadId })}`);

    const reminderResult = await this.cancelThreadReminders(threadId);
    await this.terminateActiveRuns(threadId);
    await this.terminateThreadContainers(threadId);
    await this.sweepThreadArtifacts(threadId);

    await this.emitThreadMetrics(threadId);

    this.logger.log(
      `ThreadCleanup: pipeline complete${this.format({
        threadId,
        cancelledRemindersDb: reminderResult.cancelledDb,
        clearedReminderTimers: reminderResult.clearedRuntime,
      })}`,
    );
  }

  private handleActiveRuns(threadId: string, activeRuns: RunRecord[]): void {
    this.logger.log(
      `ThreadCleanup: terminating active runs${this.format({ threadId, runCount: activeRuns.length })}`,
    );
    for (const run of activeRuns) this.runSignals.activateTerminate(run.id);
  }

  private async ensureThreadClosed(node: ThreadNode): Promise<void> {
    if (node.status === 'closed') return;
    const result = await this.persistence.updateThread(node.id, { status: 'closed' });
    node.status = result.status;
  }

  private async collectThreadNodes(rootId: string): Promise<ThreadNode[]> {
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
    });
  }

  private async deleteWorkspaceVolume(threadId: string): Promise<void> {
    const volumeName = `ha_ws_${threadId}`;
    try {
      const dockerContainers = await this.containerService.listContainersByVolume(volumeName);
      if (dockerContainers.length > 0) {
        this.logger.warn(
          `ThreadCleanup: workspace volume still referenced by containers; skipping deletion${this.format({
            threadId,
            volumeName,
            containerCount: dockerContainers.length,
            containerIds: dockerContainers,
          })}`,
        );
        return;
      }

      const registryRefs = await this.registry.findByVolume(volumeName);
      const activeRefs = registryRefs.filter((ref) => ref.threadId !== threadId || ref.status !== 'stopped');
      if (activeRefs.length > 0) {
        this.logger.warn(
          `ThreadCleanup: workspace volume referenced in registry; skipping deletion${this.format({
            threadId,
            volumeName,
            references: activeRefs,
          })}`,
        );
        return;
      }

      await this.containerService.removeVolume(volumeName, { force: true });
        this.logger.log(`ThreadCleanup: workspace volume removed${this.format({ threadId, volumeName })}`);
    } catch (error) {
      this.logger.error(
        `ThreadCleanup: failed to remove workspace volume${this.format({ threadId, volumeName, error })}`,
      );
    }
  }

  private async terminateActiveRuns(threadId: string): Promise<void> {
    try {
      const activeRuns = await this.listRunningRuns(threadId);
      if (activeRuns.length > 0) {
        this.handleActiveRuns(threadId, activeRuns);
      }
    } catch (error) {
      this.logger.warn(`ThreadCleanup: failed to enumerate active runs${this.format({ threadId, error })}`);
    }
  }

  private async terminateThreadContainers(threadId: string): Promise<void> {
    try {
      await this.termination.terminateByThread(threadId);
    } catch (error) {
      this.logger.error(`ThreadCleanup: container termination failed${this.format({ threadId, error })}`);
    }
  }

  private async sweepThreadArtifacts(threadId: string): Promise<void> {
    try {
      await this.cleanup.sweepSelective(threadId, {
        graceSeconds: STOP_GRACE_SECONDS,
        force: FORCE_REMOVE_CONTAINERS,
        deleteEphemeral: DELETE_EPHEMERAL_VOLUMES,
      });
    } catch (error) {
      this.logger.error(`ThreadCleanup: selective cleanup failed${this.format({ threadId, error })}`);
    }

    await this.deleteWorkspaceVolume(threadId);
  }

  private async cancelThreadReminders(threadId: string): Promise<{ cancelledDb: number; clearedRuntime: number }> {
    try {
      return await this.reminders.cancelThreadReminders({ threadId });
    } catch (error) {
      this.logger.warn(`ThreadCleanup: reminder cancellation failed${this.format({ threadId, error })}`);
      return { cancelledDb: 0, clearedRuntime: 0 };
    }
  }

  private async emitThreadMetrics(threadId: string): Promise<void> {
    try {
      this.eventsBus.emitThreadMetrics({ threadId });
      this.eventsBus.emitThreadMetricsAncestors({ threadId });
    } catch (error) {
      this.logger.warn(`ThreadCleanup: metrics emission failed${this.format({ threadId, error })}`);
    }
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
}
