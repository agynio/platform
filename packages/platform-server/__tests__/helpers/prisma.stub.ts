import { PrismaService } from '../../src/core/services/prisma.service';

export function createPrismaStub() {
  const threads: Array<{ id: string; alias: string; parentId: string | null; summary: string | null; status: 'open' | 'closed'; createdAt: Date; channel: any }> = [];
  const runs: Array<{ id: string; threadId: string; status: string; createdAt: Date; updatedAt: Date }> = [];
  const messages: Array<{ id: string; kind: string; text: string | null; source: any; createdAt: Date }> = [];
  const runMessages: Array<{ runId: string; messageId: string; type: string; createdAt: Date }> = [];
  const reminders: Array<{ id: string; threadId: string; note: string; at: Date; createdAt: Date; completedAt: Date | null }> = [];

  let idSeq = 1;
  const timeSeed = Date.now();
  const newId = () => `t-${idSeq++}`;

  const prisma: any = {
    thread: {
      findUnique: async ({ where, select }: any) => {
        let row: any = null;
        if (where?.alias) row = threads.find((t) => t.alias === where.alias) || null;
        else if (where?.id) row = threads.find((t) => t.id === where.id) || null;
        if (!row) return null;
        if (select) {
          const out: any = {};
          for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
          return out;
        }
        return row;
      },
      create: async ({ data }: any) => {
        const row = {
          id: newId(),
          alias: data.alias,
          parentId: data.parentId ?? null,
          summary: data.summary ?? null,
          status: data.status ?? 'open',
          createdAt: new Date(timeSeed + idSeq),
          channel: data.channel ?? null,
        };
        threads.push(row);
        return row;
      },
      update: async ({ where: { id }, data }: any) => {
        const idx = threads.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const next = { ...threads[idx] } as any;
        if (Object.prototype.hasOwnProperty.call(data, 'summary')) next.summary = data.summary ?? null;
        if (Object.prototype.hasOwnProperty.call(data, 'status')) next.status = data.status;
        if (Object.prototype.hasOwnProperty.call(data, 'channel')) next.channel = data.channel ?? null;
        threads[idx] = next as any;
        return threads[idx];
      },
      updateMany: async ({ where, data }: any) => {
        const target = threads.find((t) => t.id === where.id && t.summary === null);
        if (target && Object.prototype.hasOwnProperty.call(data, 'summary')) target.summary = data.summary ?? null;
        return { count: target ? 1 : 0 };
      },
      findMany: async (args: any) => {
        let rows = [...threads];
        const where = args?.where || {};
        if (where.parentId === null) rows = rows.filter((t) => t.parentId === null);
        if (where.parentId && typeof where.parentId === 'string') rows = rows.filter((t) => t.parentId === where.parentId);
        if (where.status) rows = rows.filter((t) => t.status === where.status);
        if (args?.orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const take = args?.take;
        const selected = rows.slice(0, take || rows.length);
        if (args?.select) {
          return selected.map((t) => {
            const out: any = {};
            for (const k of Object.keys(args.select)) if (args.select[k]) out[k] = (t as any)[k];
            return out;
          });
        }
        return selected;
      },
    },
    run: {
      create: async ({ data }: any) => {
        const row = { id: `r-${idSeq++}`, threadId: data.threadId, status: data.status ?? 'running', createdAt: new Date(timeSeed + idSeq), updatedAt: new Date(timeSeed + idSeq) };
        runs.push(row);
        return row;
      },
      findUnique: async ({ where: { id } }: any) => runs.find((r) => r.id === id) || null,
      update: async ({ where: { id }, data }: any) => {
        const r = runs.find((x) => x.id === id);
        if (r && data.status) r.status = data.status;
        if (r) r.updatedAt = new Date();
        return r;
      },
      findMany: async () => runs,
    },
    message: {
      create: async ({ data }: any) => {
        const row = { id: `m-${idSeq++}`, kind: data.kind, text: data.text ?? null, source: data.source, createdAt: new Date(timeSeed + idSeq) };
        messages.push(row);
        return row;
      },
      findMany: async ({ where: { id: { in: ids } } }: any) => messages.filter((m) => ids.includes(m.id)),
    },
    runMessage: {
      create: async ({ data }: any) => {
        const row = { runId: data.runId, messageId: data.messageId, type: data.type, createdAt: new Date(timeSeed + idSeq) };
        runMessages.push(row);
        return row;
      },
      findMany: async ({ where: { runId, type } }: any) => runMessages.filter((rm) => rm.runId === runId && rm.type === type),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn({ thread: prisma.thread, run: prisma.run, message: prisma.message, runMessage: prisma.runMessage }),
    reminder: {
      create: async ({ data }: any) => {
        const row = { id: data.id ?? `rem-${idSeq++}`, threadId: data.threadId, note: data.note, at: data.at, createdAt: new Date(timeSeed + idSeq), completedAt: data.completedAt ?? null };
        reminders.push(row);
        return row;
      },
      update: async ({ where: { id }, data }: any) => {
        const r = reminders.find((x) => x.id === id);
        if (r && Object.prototype.hasOwnProperty.call(data, 'completedAt')) r.completedAt = data.completedAt ?? null;
        return r;
      },
      findMany: async () => reminders,
    },
    _store: { threads, runs, messages, runMessages, reminders },
    // Minimal implementation to support ThreadsMetricsService tests.
    // Accepts TemplateStrings and values; expects first array value to contain root IDs.
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ root_id: string; reminders_count: number; desc_working: boolean; self_working: boolean }>> {
      const idsArg = values.find((v) => Array.isArray(v)) as string[] | undefined;
      const roots = Array.isArray(idsArg) ? idsArg : [];
      function collectSubtree(root: string): string[] {
        const acc: string[] = [root];
        const stack = [root];
        while (stack.length) {
          const cur = stack.pop()!;
          const kids = threads.filter((t) => t.parentId === cur).map((t) => t.id);
          for (const k of kids) { acc.push(k); stack.push(k); }
        }
        return acc;
      }
      const isRunning = new Set(runs.filter((r) => r.status === 'running').map((r) => r.threadId));
      const out: Array<{ root_id: string; reminders_count: number; desc_working: boolean; self_working: boolean }> = [];
      for (const root of roots) {
        const sub = collectSubtree(root);
        const self_working = isRunning.has(root);
        const desc_working = sub.some((id) => id !== root && isRunning.has(id));
        const reminders_count = reminders.filter((rem) => sub.includes(rem.threadId) && rem.completedAt == null).length;
        out.push({ root_id: root, reminders_count, desc_working, self_working });
      }
      return out;
    },
  };
  return prisma;
}

export class StubPrismaService extends PrismaService {
  constructor(private stub: any) {
    super({} as any, {} as any);
  }
  override getClient(): any {
    return this.stub;
  }
}
