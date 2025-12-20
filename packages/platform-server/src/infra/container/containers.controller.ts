import { BadRequestException, Controller, Get, Inject, Query, Logger, Param } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { Prisma, type PrismaClient, type ContainerStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeContainerMounts, type ContainerMount } from './container.mounts';

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

type ContainerStatusFilter = ContainerStatus | 'all';
type ContainerHealth = 'healthy' | 'unhealthy' | 'starting';

type RawContainerEvent = {
  id: string;
  containerId: string;
  eventType: string;
  exitCode: number | null;
  signal: string | null;
  health: string | null;
  reason: string | null;
  message: string | null;
  createdAt: Date;
};

const isHealth = (value: unknown): value is ContainerHealth =>
  value === 'healthy' || value === 'unhealthy' || value === 'starting';

export class ListContainersQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['running', 'stopped', 'terminating', 'failed', 'all'])
  status?: ContainerStatusFilter;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return undefined;
  })
  includeStopped?: boolean;

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

  @IsOptional()
  @IsISO8601()
  since?: string;
}

export class ListContainerEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;
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
    name: string;
    status: ContainerStatus;
    startedAt: string;
    lastUsedAt: string;
    killAfterAt: string | null;
    role: 'workspace' | 'dind' | string;
    sidecars?: Array<{ containerId: string; role: 'dind'; image: string; status: ContainerStatus; name: string }>;
    mounts?: Array<{ source: string; destination: string }>;
    autoRemoved: boolean;
    health: ContainerHealth | null;
    lastEventAt: string | null;
  }> }> {
    try {
      const {
        status,
        includeStopped,
        since,
        threadId,
        image,
        nodeId,
        sortBy = SortBy.lastUsedAt,
        sortDir = SortDir.desc,
        limit,
      } = query || {};

    // Build Prisma where clause with optional filters
    const where: Prisma.ContainerWhereInput = {};
    if (status === 'all') {
      // no status constraint
    } else if (status) {
      where.status = status;
    } else if (includeStopped) {
      where.status = { in: ['running', 'terminating', 'stopped', 'failed'] };
    } else {
      where.status = 'running';
    }
    if (threadId) where.threadId = threadId;
    if (image) where.image = image;
    if (nodeId) where.nodeId = nodeId;
    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        throw new BadRequestException('Invalid since timestamp');
      }
      where.updatedAt = { gte: sinceDate };
    }

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

    const rows: Array<{
      containerId: string;
      threadId: string | null;
      image: string;
      name: string;
      status: ContainerStatus;
      createdAt: Date;
      lastUsedAt: Date;
      killAfterAt: Date | null;
      metadata: unknown;
    }> = await this.prisma.container.findMany({
      where,
      orderBy,
      select: {
        containerId: true,
        threadId: true,
        image: true,
        name: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
        killAfterAt: true,
        metadata: true,
      },
      take,
    });

    // Narrow type guard for metadata.labels
    type MetadataShape = {
      labels?: Record<string, unknown>;
      mounts?: unknown;
      autoRemoved?: unknown;
      health?: unknown;
      lastEventAt?: unknown;
    };
    const sanitizeName = (value: unknown): string => {
      if (typeof value !== 'string') throw new Error('Container name missing');
      const trimmed = value.trim();
      if (!trimmed) throw new Error('Container name is empty');
      return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    };
    const toMetadata = (value: unknown): {
      labels: Record<string, string>;
      mounts: ContainerMount[];
      autoRemoved: boolean;
      health?: ContainerHealth;
      lastEventAt?: string;
    } => {
      if (!value || typeof value !== 'object') return { labels: {}, mounts: [], autoRemoved: false };
      const meta = value as MetadataShape;
      const rawLabels = meta.labels && typeof meta.labels === 'object' && meta.labels !== null ? meta.labels : {};
      const labels: Record<string, string> = {};
      for (const [key, val] of Object.entries(rawLabels)) if (typeof val === 'string') labels[key] = val;
      const mounts = sanitizeContainerMounts(meta.mounts);
      const autoRemoved = typeof meta.autoRemoved === 'boolean' ? meta.autoRemoved : false;
      const healthCandidate = typeof meta.health === 'string' ? meta.health : undefined;
      const health = isHealth(healthCandidate) ? healthCandidate : undefined;
      const lastEventAt = typeof meta.lastEventAt === 'string' ? meta.lastEventAt : undefined;
      return { labels, mounts, autoRemoved, health, lastEventAt };
    };
    // Exclude DinD from top-level list (only attach as sidecars)
    const filteredRows = rows.filter((row) => {
      const { labels } = toMetadata(row.metadata);
      const role = labels['hautech.ai/role'] ?? 'workspace';
      return role !== 'dind';
    });

    // Optimize: preselect DinD sidecars for current parent set via JSON-path raw query;
    // provide a safe fallback when $queryRaw is not implemented by the Prisma stub.
    const parentIds = filteredRows.map((row) => row.containerId);
    const byParent: Record<string, Array<{ containerId: string; role: 'dind'; image: string; status: ContainerStatus; name: string }>> = {};
    const hasQueryRaw = (() => {
      const obj = this.prisma as unknown as Record<string, unknown>;
      const fn = obj && (obj['$queryRaw'] as unknown);
      return typeof fn === 'function';
    })();
    let sidecarSource: Array<{ containerId: string; image: string; status: unknown; metadata: unknown; name: string }> = [];
    if (hasQueryRaw) {
      if (parentIds.length === 0) {
        sidecarSource = [];
      } else {
        const q = Prisma.sql`
          SELECT "containerId", "image", "status", "metadata", "name" FROM "Container"
          WHERE "metadata"->'labels'->>'hautech.ai/role' = 'dind'
            AND ("metadata"->'labels'->>'hautech.ai/parent_cid') IN (${Prisma.join(parentIds)})
        `;
        sidecarSource = await this.prisma.$queryRaw<Array<{ containerId: string; image: string; status: string; metadata: unknown; name: string }>>(q);
      }
    } else {
      sidecarSource = await this.prisma.container.findMany({
        select: { containerId: true, image: true, status: true, metadata: true, name: true },
      }) as Array<{ containerId: string; image: string; status: ContainerStatus; metadata: unknown; name: string }>;
    }
    const isStatus = (s: unknown): s is ContainerStatus =>
      typeof s === 'string' && ['running', 'stopped', 'terminating', 'failed'].includes(s);
    for (const sc of sidecarSource) {
      const { labels } = toMetadata(sc.metadata);
      const role = labels['hautech.ai/role'];
      const parent = labels['hautech.ai/parent_cid'];
      if (role !== 'dind') continue;
      if (!parent) continue;
      if (!parentIds.includes(parent)) continue;
      const status: ContainerStatus = typeof sc.status === 'string'
        ? (isStatus(sc.status) ? sc.status : 'failed')
        : (sc.status as ContainerStatus);
      const arr = byParent[parent] || (byParent[parent] = []);
      const name = sanitizeName(sc.name);
      arr.push({ containerId: sc.containerId, role: 'dind', image: sc.image, status, name });
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
    const items = filteredRows.map((row) => {
      const { labels, mounts, autoRemoved, health, lastEventAt } = toMetadata(row.metadata);
      const role = labels['hautech.ai/role'] ?? 'workspace';
      const name = sanitizeName(row.name);
      return {
        containerId: row.containerId,
        threadId: row.threadId,
        image: row.image,
        name,
        status: row.status,
        startedAt: toIso(row.createdAt),
        lastUsedAt: toIso(row.lastUsedAt),
        killAfterAt: row.killAfterAt ? toIso(row.killAfterAt) : null,
        role,
        sidecars: byParent[row.containerId] || [],
        mounts,
        autoRemoved,
        health: health ?? null,
        lastEventAt: lastEventAt ? toIso(lastEventAt) : null,
      };
    });

    return { items };
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in (e as Record<string, unknown>) ? String((e as Error).message) : String(e);
    this.logger.error(`ContainersController.list error: ${msg}`);
    throw e;
  }
}

  @Get(':containerId/events')
  async listEvents(
    @Param('containerId') containerId: string,
    @Query() query: ListContainerEventsQueryDto,
  ): Promise<{
    items: Array<{
      id: string;
      containerId: string;
      eventType: string;
      exitCode: number | null;
      signal: string | null;
      health: string | null;
      reason: string | null;
      message: string | null;
      createdAt: string;
    }>;
    page: {
      limit: number;
      order: 'asc' | 'desc';
      nextBefore: string | null;
      nextAfter: string | null;
    };
  }> {
    if (typeof containerId !== 'string' || !containerId.trim()) {
      throw new BadRequestException('containerId is required');
    }

    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit) ? query.limit : 50;
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const before = query.before ? new Date(query.before) : undefined;
    const since = query.since ? new Date(query.since) : undefined;

    if (before && Number.isNaN(before.getTime())) {
      throw new BadRequestException('Invalid before timestamp');
    }
    if (since && Number.isNaN(since.getTime())) {
      throw new BadRequestException('Invalid since timestamp');
    }

    const clampedLimit = Math.max(1, Math.min(200, limit));
    const take = clampedLimit + 1;

    const createdAt: Prisma.DateTimeFilter = {};
    if (since) createdAt.gte = since;
    if (before) createdAt.lt = before;

    const where: Prisma.ContainerEventWhereInput = {
      containerId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const rows = (await this.prisma.containerEvent.findMany({
      where,
      orderBy: { createdAt: order },
      take,
      select: {
        id: true,
        containerId: true,
        eventType: true,
        exitCode: true,
        signal: true,
        health: true,
        reason: true,
        message: true,
        createdAt: true,
      },
    })) as RawContainerEvent[];

    const hasMore = rows.length > clampedLimit;
    const trimmed: RawContainerEvent[] = hasMore ? rows.slice(0, clampedLimit) : rows;

    const items = trimmed.map((row) => ({
      id: row.id,
      containerId: row.containerId,
      eventType: row.eventType,
      exitCode: row.exitCode ?? null,
      signal: row.signal ?? null,
      health: row.health ?? null,
      reason: row.reason ?? null,
      message: row.message ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const cursorSource = items[items.length - 1];
    const nextBefore = hasMore && order === 'desc' && cursorSource ? cursorSource.createdAt : null;
    const nextAfter = hasMore && order === 'asc' && cursorSource ? cursorSource.createdAt : null;

    return {
      items,
      page: {
        limit: clampedLimit,
        order,
        nextBefore,
        nextAfter,
      },
    };
  }
}
