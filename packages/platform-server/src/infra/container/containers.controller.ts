import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import type { PrismaClient, ContainerStatus, Prisma } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContainerService } from './container.service';
import { LoggerService } from '../../core/services/logger.service';

// Allowed sort columns for containers list
enum SortBy {
  lastUsedAt = 'lastUsedAt',
  startedAt = 'startedAt',
  killAfterAt = 'killAfterAt',
}

enum SortDir {
  asc = 'asc',
  desc = 'desc',
}

export class ListContainersQueryDto {
  @IsOptional()
  @IsIn(['running', 'stopped', 'terminating', 'failed'])
  status?: ContainerStatus;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy;

  @IsOptional()
  @IsEnum(SortDir)
  sortDir?: SortDir;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller('api/containers')
export class ContainersController {
  private prisma: PrismaClient;

  constructor(
    @Inject(PrismaService) prismaSvc: PrismaService,
    @Inject(ContainerService) private containers: ContainerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {
    this.prisma = prismaSvc.getClient();
  }

  @Get()
  async list(@Query() query: ListContainersQueryDto): Promise<{ items: Array<{
    containerId: string;
    threadId: string | null;
    role: string;
    image: string;
    status: ContainerStatus;
    startedAt: string;
    lastUsedAt: string;
    killAfterAt: string | null;
  }> }> {
    const {
      status = 'running' as ContainerStatus,
      threadId,
      image,
      nodeId,
      sortBy = SortBy.lastUsedAt,
      sortDir = SortDir.desc,
      limit,
    } = query || {};

    // Build Prisma where clause with optional filters
    const where: Prisma.ContainerWhereInput = { status };
    if (threadId) where.threadId = threadId;
    if (image) where.image = image;
    if (nodeId) where.nodeId = nodeId;

    // Translate sortBy to actual DB column (startedAt maps to createdAt)
    let orderBy: Prisma.ContainerOrderByWithRelationInput;
    const dir: Prisma.SortOrder = sortDir === SortDir.asc ? 'asc' : 'desc';
    switch (sortBy) {
      case SortBy.startedAt:
        orderBy = { createdAt: dir };
        break;
      case SortBy.killAfterAt:
        orderBy = { killAfterAt: dir };
        break;
      case SortBy.lastUsedAt:
      default:
        orderBy = { lastUsedAt: dir };
        break;
    }

    const limNum = typeof limit === 'number' ? limit : Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    const take = typeof limNum === 'number' && Number.isFinite(limNum) ? Math.max(1, Math.min(500, limNum)) : 200;

    const rows = await this.prisma.container.findMany({
      where,
      orderBy,
      select: {
        containerId: true,
        threadId: true,
        image: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
        killAfterAt: true,
        metadata: true,
      },
      take,
    });

    // Map createdAt -> startedAt and return minimal shape
    const deriveRole = (meta: unknown): string => {
      const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : undefined;
      const labels = m && typeof m['labels'] === 'object' && m['labels'] !== null ? (m['labels'] as Record<string, string>) : undefined;
      const role = labels && typeof labels['hautech.ai/role'] === 'string' ? labels['hautech.ai/role'] : undefined;
      return role ?? 'workspace';
    };

    const items = rows.map((r) => ({
      containerId: r.containerId,
      threadId: r.threadId,
      role: deriveRole(r.metadata),
      image: r.image,
      status: r.status,
      startedAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      killAfterAt: r.killAfterAt ? r.killAfterAt.toISOString() : null,
    }));

    return { items };
  }

  @Get(':containerId/sidecars')
  async listSidecars(@Param('containerId') containerId: string): Promise<{
    items: Array<{
      containerId: string;
      parentContainerId: string;
      role: 'dind';
      image: string;
      status: 'running' | 'stopped';
      startedAt: string;
    }>;
  }> {
    // Lookup DinD sidecars by labels
    const handles = await this.containers.findContainersByLabels(
      { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': containerId },
      { all: true },
    );
    const docker = this.containers.getDocker();
    const results = await Promise.allSettled(
      handles.map(async (h) => {
        const inspect = await docker.getContainer(h.id).inspect();
        const labels = (inspect?.Config?.Labels || {}) as Record<string, string>;
        return {
          containerId: String(inspect?.Id ?? h.id),
          parentContainerId: labels['hautech.ai/parent_cid'] || containerId,
          role: 'dind' as const,
          image: String(inspect?.Config?.Image ?? 'unknown'),
          status: inspect?.State?.Running ? ('running' as const) : ('stopped' as const),
          startedAt: inspect?.Created ? new Date(inspect.Created).toISOString() : new Date(0).toISOString(),
        };
      }),
    );
    const items = results
      .map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        // Log failures with container id
        const id = handles[i]?.id ?? 'unknown';
        this.logger.error('ContainersController: sidecar inspect failed', { id, error: r.reason });
        return undefined;
      })
      .filter((x): x is {
        containerId: string;
        parentContainerId: string;
        role: 'dind';
        image: string;
        status: 'running' | 'stopped';
        startedAt: string;
      } => !!x);
    return { items };
  }
}
