import { Inject, Injectable } from '@nestjs/common';
import type { MemoryEntity as PrismaMemoryEntity, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../core/services/prisma.service';
import type { DeleteResult, MemoryEntity, MemoryEntityWithChildren } from './memory.types';

export interface MemoryEntitiesRepositoryPort {
  resolvePath(filter: RepoFilter, segments: string[]): Promise<MemoryEntity | null>;
  ensurePath(filter: RepoFilter, segments: string[]): Promise<MemoryEntity | null>;
  listChildren(filter: RepoFilter, parentId: string | null): Promise<MemoryEntityWithChildren[]>;
  deleteSubtree(filter: RepoFilter, entityId: string | null): Promise<DeleteResult>;
  entityHasChildren(entityId: string): Promise<boolean>;
  updateContent(entityId: string, content: string): Promise<void>;
  listAll(filter: RepoFilter): Promise<MemoryEntity[]>;
  listDistinctNodeThreads(): Promise<Array<{ nodeId: string; threadId: string | null }>>;
}

export type RepoFilter = { nodeId: string; threadId: string | null };

@Injectable()
export class PostgresMemoryEntitiesRepository implements MemoryEntitiesRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prismaSvc: PrismaService) {}

  private async getClient(): Promise<PrismaClient> {
    return this.prismaSvc.getClient();
  }

  private toEntity(row: PrismaMemoryEntity): MemoryEntity {
    return {
      id: row.id,
      nodeId: row.nodeId,
      threadId: row.threadId,
      parentId: row.parentId,
      name: row.name,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapChildren(row: PrismaMemoryEntity & { _count: { children: number } }): MemoryEntityWithChildren {
    return {
      ...this.toEntity(row),
      hasChildren: row._count.children > 0,
    };
  }

  private async traverse(
    filter: RepoFilter,
    segments: string[],
    opts: { createMissing: boolean },
  ): Promise<PrismaMemoryEntity | null> {
    if (segments.length === 0) return null;
    const prisma = await this.getClient();
    if (!opts.createMissing) {
      let parentId: string | null = null;
      let current: PrismaMemoryEntity | null = null;
      for (const segment of segments) {
        current = await prisma.memoryEntity.findFirst({
          where: {
            nodeId: filter.nodeId,
            threadId: filter.threadId,
            parentId,
            name: segment,
          },
        });
        if (!current) return null;
        parentId = current.id;
      }
      return current;
    }

    return prisma.$transaction(async (tx) => {
      let parentId: string | null = null;
      let current: PrismaMemoryEntity | null = null;
      for (const segment of segments) {
        current = await tx.memoryEntity.findFirst({
          where: {
            nodeId: filter.nodeId,
            threadId: filter.threadId,
            parentId,
            name: segment,
          },
        });
        if (!current) {
          current = await tx.memoryEntity.create({
            data: {
              nodeId: filter.nodeId,
              threadId: filter.threadId,
              parentId,
              name: segment,
            },
          });
        }
        parentId = current.id;
      }
      return current;
    });
  }

  async resolvePath(filter: RepoFilter, segments: string[]): Promise<MemoryEntity | null> {
    const row = await this.traverse(filter, segments, { createMissing: false });
    return row ? this.toEntity(row) : null;
  }

  async ensurePath(filter: RepoFilter, segments: string[]): Promise<MemoryEntity | null> {
    const row = await this.traverse(filter, segments, { createMissing: true });
    return row ? this.toEntity(row) : null;
  }

  async listChildren(filter: RepoFilter, parentId: string | null): Promise<MemoryEntityWithChildren[]> {
    const prisma = await this.getClient();
    const rows = await prisma.memoryEntity.findMany({
      where: {
        nodeId: filter.nodeId,
        threadId: filter.threadId,
        parentId,
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { children: true } } },
    });
    return rows.map((row) => this.mapChildren(row));
  }

  async entityHasChildren(entityId: string): Promise<boolean> {
    const prisma = await this.getClient();
    const child = await prisma.memoryEntity.findFirst({
      where: { parentId: entityId },
      select: { id: true },
    });
    return !!child;
  }

  async updateContent(entityId: string, content: string): Promise<void> {
    const prisma = await this.getClient();
    await prisma.memoryEntity.update({
      where: { id: entityId },
      data: { content },
    });
  }

  async listAll(filter: RepoFilter): Promise<MemoryEntity[]> {
    const prisma = await this.getClient();
    const rows = await prisma.memoryEntity.findMany({
      where: {
        nodeId: filter.nodeId,
        threadId: filter.threadId,
      },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toEntity(row));
  }

  async listDistinctNodeThreads(): Promise<Array<{ nodeId: string; threadId: string | null }>> {
    const prisma = await this.getClient();
    const rows = await prisma.$queryRaw<Array<{ node_id: string; thread_id: string | null }>>`
      SELECT node_id, thread_id
      FROM memory_entities
      GROUP BY node_id, thread_id
      ORDER BY node_id ASC, thread_id ASC
    `;
    return rows.map((row) => ({ nodeId: row.node_id, threadId: row.thread_id }));
  }

  async deleteSubtree(filter: RepoFilter, entityId: string | null): Promise<DeleteResult> {
    const prisma = await this.getClient();
    const threadId = filter.threadId;

    const rows = entityId
      ? await prisma.$queryRaw<Array<{ id: string; parent_id: string | null; content: string | null }>>`
          WITH RECURSIVE tree AS (
            SELECT id, parent_id, content
            FROM memory_entities
            WHERE id = ${entityId}
              AND node_id = ${filter.nodeId}
              AND ((thread_id IS NULL AND ${threadId} IS NULL) OR thread_id = ${threadId})
            UNION ALL
            SELECT child.id, child.parent_id, child.content
            FROM memory_entities child
            INNER JOIN tree ON child.parent_id = tree.id
            WHERE child.node_id = ${filter.nodeId}
              AND ((child.thread_id IS NULL AND ${threadId} IS NULL) OR child.thread_id = ${threadId})
          )
          SELECT id, parent_id, content FROM tree
        `
      : await prisma.$queryRaw<Array<{ id: string; parent_id: string | null; content: string | null }>>`
          SELECT id, parent_id, content
          FROM memory_entities
          WHERE node_id = ${filter.nodeId}
            AND ((thread_id IS NULL AND ${threadId} IS NULL) OR thread_id = ${threadId})
        `;

    if (rows.length === 0) {
      return { removed: 0 };
    }

    if (entityId) {
      await prisma.memoryEntity.delete({ where: { id: entityId } });
    } else {
      await prisma.memoryEntity.deleteMany({
        where: {
          nodeId: filter.nodeId,
          threadId,
        },
      });
    }

    return { removed: rows.length };
  }
}
