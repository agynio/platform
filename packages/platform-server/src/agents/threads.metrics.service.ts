import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { LoggerService } from '../core/services/logger.service';

export type ThreadMetrics = { remindersCount: number; activity: 'working' | 'waiting' | 'idle' };

@Injectable()
export class ThreadsMetricsService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService, @Inject(LoggerService) private readonly logger: LoggerService) {}

  private get prisma(): PrismaClient { return this.prismaService.getClient(); }

  /** Aggregate subtree metrics for provided root IDs. */
  async getThreadsMetrics(ids: string[]): Promise<Record<string, ThreadMetrics>> {
    if (!ids || ids.length === 0) return {};
    try {
      type MetricsRow = { root_id: string; reminders_count: number; desc_working: boolean; self_working: boolean };
      const rows: MetricsRow[] = await this.prisma.$queryRaw`
        with sel as (
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
        ), agg as (
          select rec.root_id,
                 count(ar.thread_id) as reminders_count,
                 bool_or(runs.thread_id is not null) filter (where rec.thread_id != rec.root_id) as desc_working,
                 bool_or(runs.thread_id is not null) filter (where rec.thread_id = rec.root_id) as self_working
          from rec
          left join runs on runs.thread_id = rec.thread_id
          left join active_reminders ar on ar.thread_id = rec.thread_id
          group by rec.root_id
        )
        select root_id,
               reminders_count::int,
               desc_working,
               self_working
        from agg;
      `;
      const out: Record<string, ThreadMetrics> = {};
      for (const r of rows) {
        const activity: ThreadMetrics['activity'] = r.self_working ? 'working' : (r.desc_working || r.reminders_count > 0) ? 'waiting' : 'idle';
        out[r.root_id] = { remindersCount: r.reminders_count, activity };
      }
      return out;
    } catch (e) {
      // JS fallback for tests/stub env without $queryRaw
      const err = e as Error;
      this.logger.warn('ThreadsMetricsService falling back to in-memory aggregation', { ids, error: err?.message || String(e) });
      const prisma = this.prisma;
      const allThreads = await prisma.thread.findMany({ select: { id: true, parentId: true } });
      const runs = await prisma.run.findMany({});
      type ReminderRow = { threadId: string; completedAt: Date | null };
      const prismaWithReminders = prisma as PrismaClient & { reminder: { findMany: () => Promise<ReminderRow[]> } };
      const hasModelReminders = 'reminder' in prismaWithReminders && typeof prismaWithReminders.reminder.findMany === 'function';
      const reminders: ReminderRow[] = hasModelReminders ? await prismaWithReminders.reminder.findMany() : [];
      const out: Record<string, ThreadMetrics> = {};
      function collectSubtree(root: string): string[] {
        const ids: string[] = [root];
        const stack = [root];
        while (stack.length) {
          const cur = stack.pop()!;
          const kids = allThreads.filter((t) => t.parentId === cur).map((t) => t.id);
          for (const k of kids) { ids.push(k); stack.push(k); }
        }
        return ids;
      }
      const hasRunning = new Map<string, boolean>();
      for (const r of runs) if (r.status === 'running') hasRunning.set(r.threadId, true);
      for (const id of ids) {
        const sub = collectSubtree(id);
        const selfWorking = !!hasRunning.get(id);
        const descWorking = sub.some((tid) => tid !== id && !!hasRunning.get(tid));
        const remindersCount = reminders.filter((rem) => sub.includes(rem.threadId) && rem.completedAt == null).length;
        const activity: ThreadMetrics['activity'] = selfWorking ? 'working' : (descWorking || remindersCount > 0) ? 'waiting' : 'idle';
        out[id] = { remindersCount, activity };
      }
      return out;
    }
  }
}

