import { PrismaService } from '../../core/services/prisma.service';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { MemoryDoc, MemoryDirsMap, MemoryDataMap, MemoryFilter } from './memory.types';
import { Inject, Injectable } from '@nestjs/common';

export interface MemoryRepositoryPort {
  withDoc<T>(
    filter: MemoryFilter,
    fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>,
  ): Promise<T>;
  getDoc(filter: MemoryFilter): Promise<MemoryDoc | null>;
  getOrCreateDoc(filter: MemoryFilter): Promise<MemoryDoc>;
}

@Injectable()
export class PostgresMemoryRepository implements MemoryRepositoryPort {
  constructor(@Inject(PrismaService) private prismaSvc: PrismaService) {}

  private async getClient(): Promise<PrismaClient> {
    return this.prismaSvc.getClient();
  }

  private static rowToDoc(row: MemoryRow): MemoryDoc {
    return {
      nodeId: row.node_id,
      scope: row.scope,
      threadId: row.thread_id ?? undefined,
      data: (row.data || {}) as MemoryDataMap,
      dirs: (row.dirs || {}) as MemoryDirsMap,
    };
  }

  private async selectForUpdate(filter: MemoryFilter, tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<MemoryRow[]>`
      SELECT id, node_id, scope, thread_id, data, dirs, created_at, updated_at
      FROM memories
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}::"MemoryScope"
        AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async getDoc(filter: MemoryFilter): Promise<MemoryDoc | null> {
    const prisma = await this.getClient();
    const rows = await prisma.$queryRaw<MemoryRow[]>`
      SELECT id, node_id, scope, thread_id, data, dirs, created_at, updated_at
      FROM memories
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}::"MemoryScope"
        AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})
    `;
    if (!rows[0]) return null;
    return PostgresMemoryRepository.rowToDoc(rows[0]);
  }

  async getOrCreateDoc(filter: MemoryFilter): Promise<MemoryDoc> {
    const prisma = await this.getClient();
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRaw`INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES (${filter.nodeId}, ${filter.scope}::"MemoryScope", ${filter.scope === 'perThread' ? filter.threadId ?? null : null}, '{}'::jsonb, '{}'::jsonb)`;
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      return PostgresMemoryRepository.rowToDoc(row as MemoryRow);
    });
  }

  async withDoc<T>(filter: MemoryFilter, fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>): Promise<T> {
    const prisma = await this.getClient();
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRaw`INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES (${filter.nodeId}, ${filter.scope}::"MemoryScope", ${filter.scope === 'perThread' ? filter.threadId ?? null : null}, '{}'::jsonb, '{}'::jsonb)`;
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      const current: MemoryDoc = PostgresMemoryRepository.rowToDoc(row as MemoryRow);
      const { doc, result } = await fn(current);
      if (doc) {
        await tx.$executeRaw`UPDATE memories SET data = ${JSON.stringify(doc.data)}::jsonb, dirs = ${JSON.stringify(doc.dirs)}::jsonb, updated_at = NOW() WHERE node_id = ${filter.nodeId} AND scope = ${filter.scope}::"MemoryScope" AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})`;
      }
      return result as T;
    });
  }
}

// Strongly-typed row mapped from raw SQL
type MemoryRow = {
  id: string;
  node_id: string;
  scope: 'global' | 'perThread';
  thread_id: string | null;
  data: Record<string, unknown>;
  dirs: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};
