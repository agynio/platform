import { PrismaService } from '../../src/core/services/prisma.service';

export function createPrismaStub() {
  const threads: Array<{ id: string; alias: string; parentId: string | null; summary: string | null; status: 'open' | 'closed'; createdAt: Date }> = [];
  const runs: Array<{ id: string; threadId: string; status: string; createdAt: Date; updatedAt: Date }> = [];
  const messages: Array<{ id: string; kind: string; text: string | null; source: any; createdAt: Date }> = [];
  const runMessages: Array<{ runId: string; messageId: string; type: string; createdAt: Date }> = [];

  let idSeq = 1;
  const timeSeed = Date.now();
  const newId = () => `t-${idSeq++}`;

  const prisma: any = {
    thread: {
      findUnique: async ({ where: { alias } }: any) => threads.find((t) => t.alias === alias) || null,
      create: async ({ data }: any) => {
        const row = { id: newId(), alias: data.alias, parentId: data.parentId ?? null, summary: data.summary ?? null, status: data.status ?? 'open', createdAt: new Date(timeSeed + idSeq) };
        threads.push(row);
        return row;
      },
      update: async ({ where: { id }, data }: any) => {
        const idx = threads.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const next = { ...threads[idx] } as any;
        if (Object.prototype.hasOwnProperty.call(data, 'summary')) next.summary = data.summary ?? null;
        if (Object.prototype.hasOwnProperty.call(data, 'status')) next.status = data.status;
        threads[idx] = next as any;
        return threads[idx];
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
    _store: { threads, runs, messages, runMessages },
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
