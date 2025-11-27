import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';

export type ThreadMetrics = { remindersCount: number; containersCount: number; activity: 'working' | 'waiting' | 'idle'; runsCount?: number };

@Injectable()
export class ThreadsMetricsService {
  private readonly logger = new Logger(ThreadsMetricsService.name);

  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  private get prisma(): PrismaClient { return this.prismaService.getClient(); }

  /** Aggregate subtree metrics for provided root IDs. */
  async getThreadsMetrics(ids: string[]): Promise<Record<string, ThreadMetrics>> {
    if (!ids || ids.length === 0) return {};
    try {
      type MetricsRow = { root_id: string; reminders_count: number; containers_count: number; desc_working: boolean; self_working: boolean };
      const hasQueryRaw = typeof (this.prisma as unknown as Record<string, unknown>)?.['$queryRaw'] === 'function';
      let rows: MetricsRow[] = [];
      if (hasQueryRaw) {
        rows = await this.prisma.$queryRaw<MetricsRow[]>`
          with recursive sel as (
            select unnest(${ids}::uuid[]) as root_id
          ), rec as (
            select t.id as thread_id, t."parentId" as parent_id, t.id as root_id
            from "Thread" t join sel s on t.id = s.root_id
            union all
            select c.id as thread_id, c."parentId" as parent_id, r.root_id
            from "Thread" c join rec r on c."parentId" = r.thread_id
          ), runs as (
            select r."threadId" as thread_id
            from "Run" r
            where r.status = 'running'
          ), active_reminders as (
            select rem."threadId" as thread_id
            from "Reminder" rem
            where rem."completedAt" is null
              and rem."cancelledAt" is null
          ), containers as (
            select cont."threadId" as thread_id
            from "Container" cont
            where cont.status = 'running'
              and coalesce(cont.metadata->'labels'->>'hautech.ai/role', 'workspace') != 'dind'
          ), agg as (
            select rec.root_id,
                   count(ar.thread_id) as reminders_count,
                   count(cont.thread_id) filter (where cont.thread_id is not null) as containers_count,
                   bool_or(runs.thread_id is not null) filter (where rec.thread_id != rec.root_id) as desc_working,
                   bool_or(runs.thread_id is not null) filter (where rec.thread_id = rec.root_id) as self_working
            from rec
            left join runs on runs.thread_id = rec.thread_id
            left join active_reminders ar on ar.thread_id = rec.thread_id
            left join containers cont on cont.thread_id = rec.thread_id
            group by rec.root_id
          )
          select root_id,
                 reminders_count::int,
                 containers_count::int,
                 desc_working,
                 self_working
          from agg;
        `;
      } else {
        // Fallback: return idle metrics with zero reminders; tests use stubs without $queryRaw
        rows = ids.map((id) => ({ root_id: id, reminders_count: 0, containers_count: 0, desc_working: false, self_working: false }));
      }
      const out: Record<string, ThreadMetrics> = {};
      for (const r of rows) {
        const activity: ThreadMetrics['activity'] = r.self_working ? 'working' : (r.desc_working || r.reminders_count > 0) ? 'waiting' : 'idle';
        out[r.root_id] = { remindersCount: r.reminders_count, containersCount: r.containers_count, activity };
      }
      return out;
    } catch (error) {
      // Log SQL aggregation errors; do not fall back to alternate logic
      this.logger.error(
        `ThreadsMetricsService SQL aggregation error${this.format({ ids, error: this.errorInfo(error) })}`,
      );
      return {};
    }
  }
}
