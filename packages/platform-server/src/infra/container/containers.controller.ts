import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import type { PrismaClient, ContainerStatus, Prisma } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContainerService } from './container.service';
import { LoggerService } from '../../core/services/logger.service';
import { ROLE_LABEL, PARENT_CID_LABEL } from '../../constants';

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
        role: true,
        image: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
        killAfterAt: true,
      },
      take,
    });

    const items = rows.map((r) => ({
      containerId: r.containerId,
      threadId: r.threadId,
      role: typeof r.role === 'string' ? r.role : 'workspace',
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
      { [ROLE_LABEL]: 'dind', [PARENT_CID_LABEL]: containerId },
      { all: true },
    );
    const docker = this.containers.getDocker();
    const results = await Promise.allSettled(
      handles.map(async (h) => {
        const inspect = await docker.getContainer(h.id).inspect();
        // Read labels directly; fall back to provided containerId when missing
        const labels = (inspect?.Config?.Labels ?? {}) as Record<string, unknown>;
        const parentLabel = labels[PARENT_CID_LABEL];
        const parentContainerId = typeof parentLabel === 'string' && parentLabel.length > 0 ? parentLabel : containerId;
        return {
          containerId: String(inspect?.Id ?? h.id),
          parentContainerId,
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
        const err = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
        this.logger.error('ContainersController: sidecar inspect failed', { id, error: err });
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
