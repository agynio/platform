import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import type { PrismaClient, ContainerStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

// Allowed sort columns for containers list
const SortByValues = ['lastUsedAt', 'startedAt', 'killAfterAt'] as const;
type SortBy = (typeof SortByValues)[number];

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
  @IsIn(SortByValues as unknown as string[])
  sortBy?: SortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  limit?: number;
}

@Controller('api/containers')
export class ContainersController {
  private prisma: PrismaClient;

  constructor(@Inject(PrismaService) prismaSvc: PrismaService) {
    this.prisma = prismaSvc.getClient();
  }

  @Get()
  async list(@Query() query: ListContainersQueryDto): Promise<{ items: Array<{
    containerId: string;
    threadId: string | null;
    image: string;
    status: ContainerStatus;
    startedAt: Date;
    lastUsedAt: Date;
    killAfterAt: Date | null;
  }> }> {
    const {
      status = 'running',
      threadId,
      image,
      nodeId,
      sortBy = 'lastUsedAt',
      sortDir = 'desc',
      limit,
    } = query || {};

    // Build Prisma where clause with optional filters
    const where: Parameters<PrismaClient['container']['findMany']>[0]['where'] = { status };
    if (threadId) where.threadId = threadId;
    if (image) where.image = image;
    if (nodeId) where.nodeId = nodeId;

    // Translate sortBy to actual DB column (startedAt maps to createdAt)
    const orderBy: Parameters<PrismaClient['container']['findMany']>[0]['orderBy'] = (() => {
      const dir = sortDir === 'asc' ? 'asc' : 'desc';
      switch (sortBy) {
        case 'startedAt':
          return { createdAt: dir } as any;
        case 'killAfterAt':
          return { killAfterAt: dir } as any;
        case 'lastUsedAt':
        default:
          return { lastUsedAt: dir } as any;
      }
    })();

    const take = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 200;

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
      },
      take,
    });

    // Map createdAt -> startedAt and return minimal shape
    const items = rows.map((r) => ({
      containerId: r.containerId,
      threadId: r.threadId,
      image: r.image,
      status: r.status,
      startedAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      killAfterAt: r.killAfterAt,
    }));

    return { items };
  }
}

