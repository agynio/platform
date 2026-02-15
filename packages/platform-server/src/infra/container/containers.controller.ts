import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Query,
  Logger,
  Param,
  NotFoundException,
  HttpCode,
  HttpStatus,
  HttpException,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { Prisma, type PrismaClient, type ContainerStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeContainerMounts, type ContainerMount } from '@agyn/docker-runner';
import { ContainerAdminService } from './containerAdmin.service';
import { DockerRunnerRequestError } from './httpDockerRunner.client';

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
  id: number;
  container: { containerId: string };
  eventType: string;
  exitCode: number | null;
  signal: string | null;
  health: string | null;
  reason: string | null;
  message: string | null;
  createdAt: Date;
};

const EVENT_CURSOR_SEPARATOR = '|';

const encodeEventCursor = ({ createdAt, id }: { createdAt: Date; id: number | string }): string => {
  return `${createdAt.toISOString()}${EVENT_CURSOR_SEPARATOR}${String(id)}`;
};

const decodeEventCursor = (value: string): { createdAt: Date; id: number } => {
  if (!value) {
    throw new Error('Empty cursor');
  }
  const separatorIndex = value.indexOf(EVENT_CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error('Cursor must include timestamp and id');
  }
  const timestampRaw = value.slice(0, separatorIndex);
  const idRaw = value.slice(separatorIndex + 1);
  const createdAt = new Date(timestampRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('Cursor timestamp is invalid');
  }
  if (!idRaw.trim()) {
    throw new Error('Cursor id is invalid');
  }
  const id = Number(idRaw);
  if (!Number.isInteger(id)) {
    throw new Error('Cursor id is invalid');
  }
  return { createdAt, id };
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
  @IsString()
  cursor?: string;
}

@Controller('api/containers')
export class ContainersController {
  private prisma: PrismaClient;
  private readonly logger = new Logger(ContainersController.name);

  constructor(
    @Inject(PrismaService) prismaSvc: { getClient(): PrismaClient },
    private readonly containerAdmin: ContainerAdminService,
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
    const order: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';
    const since = query.since ? new Date(query.since) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      throw new BadRequestException('Invalid since timestamp');
    }

    let cursor: { createdAt: Date; id: number } | null = null;
    if (query.cursor) {
      try {
        cursor = decodeEventCursor(query.cursor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid cursor';
        throw new BadRequestException(message);
      }
    }

    const clampedLimit = Math.max(1, Math.min(200, limit));
    const take = clampedLimit + 1;

    const filters: Prisma.ContainerEventWhereInput[] = [
      { container: { containerId } },
    ];
    if (since) {
      filters.push({ createdAt: { gte: since } });
    }
    if (cursor) {
      const comparator: 'gt' | 'lt' = order === 'asc' ? 'gt' : 'lt';
      filters.push({
        OR: [
          { createdAt: { [comparator]: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { [comparator]: cursor.id },
          },
        ],
      });
    }

    const where: Prisma.ContainerEventWhereInput =
      filters.length === 1 ? filters[0] : { AND: filters };

    const orderBy: Prisma.Enumerable<Prisma.ContainerEventOrderByWithRelationInput> = [
      { createdAt: order },
      { id: order },
    ];

    const rows = (await this.prisma.containerEvent.findMany({
      where,
      orderBy,
      take,
      select: {
        id: true,
        container: { select: { containerId: true } },
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
      id: String(row.id),
      containerId: row.container.containerId,
      eventType: row.eventType,
      exitCode: row.exitCode ?? null,
      signal: row.signal ?? null,
      health: row.health ?? null,
      reason: row.reason ?? null,
      message: row.message ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const nextCursorSource = hasMore ? trimmed[trimmed.length - 1] : null;
    const encodedCursor = nextCursorSource ? encodeEventCursor(nextCursorSource) : null;
    const nextBefore = order === 'desc' ? encodedCursor : null;
    const nextAfter = order === 'asc' ? encodedCursor : null;

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

  @Delete(':containerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('containerId') containerIdParam: string, @Req() req?: unknown): Promise<void> {
    const containerId = typeof containerIdParam === 'string' ? containerIdParam.trim() : '';
    if (!containerId) {
      throw new BadRequestException('containerId is required');
    }
    const shortId = this.shortId(containerId);
    const requestId = this.extractRequestId(req);
    this.logger.log('Delete container requested', { containerId: shortId, requestId });
    try {
      const existing = await this.prisma.container.findUnique({ where: { containerId } });
      if (!existing) {
        this.logger.warn('Delete container requested for missing record', {
          containerId: shortId,
          prismaHit: false,
          requestId,
        });
        throw new NotFoundException({ code: 'container_not_found', message: 'Container not found' });
      }
      this.logger.debug('Resolved container delete target', {
        containerId: shortId,
        prismaHit: true,
        status: existing.status,
        threadId: existing.threadId,
        nodeId: existing.nodeId,
        requestId,
      });
      await this.containerAdmin.deleteContainer(containerId);
      this.logger.log('Container delete completed', { containerId: shortId, requestId });
    } catch (error) {
      this.handleDeleteError(containerId, error, requestId);
    }
  }

  private buildDeleteErrorLog(containerId: string, error: unknown, requestId?: string): Record<string, unknown> {
    const payload: Record<string, unknown> = { containerId: this.shortId(containerId) };
    if (requestId) {
      payload.requestId = requestId;
    }
    if (error instanceof DockerRunnerRequestError) {
      payload.runnerStatusCode = error.statusCode;
      payload.runnerErrorCode = error.errorCode;
      payload.message = error.message;
      payload.retryable = error.retryable;
      return payload;
    }
    if (error instanceof HttpException) {
      payload.httpStatus = error.getStatus();
      payload.response = error.getResponse();
      payload.message = error.message;
      payload.name = error.name;
      return payload;
    }
    if (error instanceof Error) {
      payload.message = error.message;
      payload.name = error.name;
      if (error.stack) {
        payload.stack = error.stack;
      }
      return payload;
    }
    payload.error = error;
    return payload;
  }

  private handleDeleteError(containerId: string, error: unknown, requestId?: string): never {
    if (error instanceof HttpException) {
      if (error.getStatus() >= 500) {
        const logPayload = this.buildDeleteErrorLog(containerId, error, requestId);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error('Container delete failed', stack, logPayload);
      }
      throw error;
    }
    const logPayload = this.buildDeleteErrorLog(containerId, error, requestId);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error('Container delete failed', stack, logPayload);
    throw this.mapDeleteError(error, requestId);
  }

  private mapDeleteError(error: unknown, requestId?: string): HttpException {
    if (error instanceof DockerRunnerRequestError) {
      const status = this.normalizeRunnerStatus(error.statusCode);
      const body = {
        code: error.errorCode ?? 'docker_runner_error',
        message: error.message,
        ...(requestId ? { requestId } : {}),
      };
      if (status === HttpStatus.NOT_FOUND) {
        return new NotFoundException(body);
      }
      return new HttpException(body, status);
    }
    return new HttpException(
      {
        code: 'container_delete_failed',
        message: 'Failed to delete container',
        ...(requestId ? { requestId } : {}),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private normalizeRunnerStatus(status?: number): number {
    if (typeof status === 'number' && status >= 400 && status < 600) {
      return status;
    }
    return HttpStatus.BAD_GATEWAY;
  }

  private extractRequestId(req?: unknown): string | undefined {
    if (!req || typeof req !== 'object') {
      return undefined;
    }
    const candidate = req as { id?: unknown; headers?: unknown; raw?: { id?: unknown; headers?: unknown } };
    const idSources = [candidate.id, candidate.raw?.id];
    for (const source of idSources) {
      if (typeof source === 'string') {
        const trimmed = source.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    const headerSources = [candidate.headers, candidate.raw?.headers];
    for (const headers of headerSources) {
      const headerValue = this.extractHeaderValue(headers, 'x-request-id') ?? this.extractHeaderValue(headers, 'request-id');
      if (headerValue) {
        return headerValue;
      }
    }
    return undefined;
  }

  private extractHeaderValue(headers: unknown, key: string): string | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }
    const normalizedKey = key.toLowerCase();
    const source = headers as Record<string, unknown>;
    const value = source[key] ?? source[normalizedKey];
    if (Array.isArray(value)) {
      return this.firstDefinedString(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    return undefined;
  }

  private shortId(containerId: string): string {
    return containerId.length > 12 ? containerId.slice(0, 12) : containerId;
  }

  private firstDefinedString(values: unknown[]): string | undefined {
    for (const entry of values) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return undefined;
  }
}
