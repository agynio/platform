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
    try {
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
    // Exclude DinD from top-level list (only attach as sidecars)
    const filteredRows = rows.filter((r) => {
      const labels = metaLabelsOf(r.metadata);
      const role = labels['hautech.ai/role'] ?? 'workspace';
      return role !== 'dind';
    });

    // Optimize: preselect DinD sidecars for current parent set via JSON-path raw query;
    // provide a safe fallback when $queryRaw is not implemented by the Prisma stub.
    const parentIds = filteredRows.map((r) => r.containerId);
    const byParent: Record<string, Array<{ containerId: string; role: 'dind'; image: string; status: ContainerStatus }>> = {};
    const hasQueryRaw = (() => {
      const obj = this.prisma as unknown as Record<string, unknown>;
      const fn = obj && (obj['$queryRaw'] as unknown);
      return typeof fn === 'function';
    })();
    let sidecarSource: Array<{ containerId: string; image: string; status: unknown; metadata: unknown }> = [];
    if (hasQueryRaw) {
      const q = Prisma.sql`
        SELECT "containerId", "image", "status", "metadata" FROM "Container"
        WHERE "metadata"->'labels'->>'hautech.ai/role' = 'dind'
          AND ("metadata"->'labels'->>'hautech.ai/parent_cid') IN (${Prisma.join(parentIds)})
      `;
      sidecarSource = await this.prisma.$queryRaw<Array<{ containerId: string; image: string; status: string; metadata: unknown }>>(q);
    } else {
      sidecarSource = await this.prisma.container.findMany({
        select: { containerId: true, image: true, status: true, metadata: true },
      }) as Array<{ containerId: string; image: string; status: ContainerStatus; metadata: unknown }>;
    }
    const isStatus = (s: unknown): s is ContainerStatus =>
      typeof s === 'string' && ['running', 'stopped', 'terminating', 'failed'].includes(s);
    for (const sc of sidecarSource) {
      const labels = metaLabelsOf(sc.metadata);
      const role = labels['hautech.ai/role'];
      const parent = labels['hautech.ai/parent_cid'];
      if (role !== 'dind') continue;
      if (!parent) continue;
      if (!parentIds.includes(parent)) continue;
      const status: ContainerStatus = typeof sc.status === 'string'
        ? (isStatus(sc.status) ? sc.status : 'failed')
        : (sc.status as ContainerStatus);
      const arr = byParent[parent] || (byParent[parent] = []);
      arr.push({ containerId: sc.containerId, role: 'dind', image: sc.image, status });
    }

      const toIso = (d: unknown): string => {
        // Validate and format without empty catch; return safe default when invalid
        if (d instanceof Date) {
          const t = d.getTime();
          return Number.isFinite(t) ? d.toISOString() : new Date(0).toISOString();
        }
        if (typeof d === 'string') {
          const dt = new Date(d);
          const t = dt.getTime();
          return Number.isFinite(t) ? dt.toISOString() : new Date(0).toISOString();
        }
        if (typeof d === 'number') {
          const dt = new Date(d);
          const t = dt.getTime();
          return Number.isFinite(t) ? dt.toISOString() : new Date(0).toISOString();
        }
        const dt = new Date(String(d));
        const t = dt.getTime();
        return Number.isFinite(t) ? dt.toISOString() : new Date(0).toISOString();
      };
    const items = filteredRows.map((r) => {
      const labels = metaLabelsOf(r.metadata);
      const role = labels['hautech.ai/role'] ?? 'workspace';
      return {
        containerId: r.containerId,
        threadId: r.threadId,
        image: r.image,
        status: r.status,
        startedAt: toIso(r.createdAt),
        lastUsedAt: toIso(r.lastUsedAt),
        killAfterAt: r.killAfterAt ? toIso(r.killAfterAt) : null,
        role,
        sidecars: byParent[r.containerId] || [],
      };
    });

    return { items };
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in (e as Record<string, unknown>) ? String((e as Error).message) : String(e);
      this.logger.error(`ContainersController.list error: ${msg}`);
      throw e;
    }
  }
}
