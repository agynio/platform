import { Controller, Get, Inject, Query, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { Prisma, type PrismaClient, type ContainerStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  private readonly logger = new Logger(ContainersController.name);

  constructor(
    @Inject(PrismaService) prismaSvc: { getClient(): PrismaClient },
  ) {
    this.prisma = prismaSvc.getClient();
  }

  @Get()
  async list(@Query() query: ListContainersQueryDto): Promise<{ items: Array<{
    containerId: string;
    threadId: string | null;
    image: string;
    status: ContainerStatus;
    startedAt: string;
    lastUsedAt: string;
    killAfterAt: string | null;
    role: 'workspace' | 'dind' | string;
    sidecars?: Array<{ containerId: string; role: 'dind'; image: string; status: ContainerStatus }>;
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

    // Narrow type guard for metadata.labels
    type MetaWithLabels = { labels?: Record<string, unknown> };
    const isMetaWithLabels = (v: unknown): v is MetaWithLabels => {
      if (typeof v !== 'object' || v === null) return false;
      const obj = v as Record<string, unknown>;
      if (!('labels' in obj)) return false;
      const lbl = (obj as { labels?: unknown }).labels;
      return typeof lbl === 'object' && lbl !== null;
    };
    const metaLabelsOf = (m: unknown): Record<string, string> => {
      if (!isMetaWithLabels(m)) return {};
      const raw = (m.labels ?? {}) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
      return out;
    };
    // Optimize: preselect DinD sidecars for current parent set via JSON-path raw query
    const parentIds = rows.map((r) => r.containerId);
    const rawSidecars = await this.prisma.$queryRaw<Array<{ containerId: string; image: string; status: string; metadata: unknown }>>`
      SELECT "containerId", "image", "status", "metadata" FROM "Container"
      WHERE "metadata"->'labels'->>'hautech.ai/role' = 'dind'
        AND ("metadata"->'labels'->>'hautech.ai/parent_cid') IN (${Prisma.join(parentIds)})
    `;
    const isStatus = (s: unknown): s is ContainerStatus =>
      typeof s === 'string' && ['running', 'stopped', 'terminating', 'failed'].includes(s);
    const byParent: Record<string, Array<{ containerId: string; role: 'dind'; image: string; status: ContainerStatus }>> = {};
    for (const sc of rawSidecars) {
      const labels = metaLabelsOf(sc.metadata);
      const parent = labels['hautech.ai/parent_cid'];
      if (!parent) continue;
      const status: ContainerStatus = isStatus(sc.status) ? sc.status : 'failed';
      const arr = byParent[parent] || (byParent[parent] = []);
      arr.push({ containerId: sc.containerId, role: 'dind', image: sc.image, status });
    }

    const items = rows.map((r) => {
      const labels = metaLabelsOf(r.metadata);
      const role = labels['hautech.ai/role'] ?? 'workspace';
      return {
        containerId: r.containerId,
        threadId: r.threadId,
        image: r.image,
        status: r.status,
        startedAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt.toISOString(),
        killAfterAt: r.killAfterAt ? r.killAfterAt.toISOString() : null,
        role,
        sidecars: byParent[r.containerId] || [],
      };
    });

    return { items };
  }
}
