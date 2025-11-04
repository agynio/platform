import { PrismaService } from '../../src/core/services/prisma.service';

export function createPrismaStub() {
  const threads: Array<{ id: string; alias: string; parentId: string | null; createdAt: Date }> = [];
  const runs: Array<{ id: string; threadId: string; status: string; createdAt: Date; updatedAt: Date }> = [];
  const messages: Array<{ id: string; kind: string; text: string | null; source: any; createdAt: Date }> = [];
  const runMessages: Array<{ runId: string; messageId: string; type: string; createdAt: Date }> = [];

  let idSeq = 1;
  const newId = () => `t-${idSeq++}`;

  const prisma: any = {
    thread: {
      findUnique: async ({ where: { alias } }: any) => threads.find((t) => t.alias === alias) || null,
      create: async ({ data }: any) => {
        const row = { id: newId(), alias: data.alias, parentId: data.parentId ?? null, createdAt: new Date() };
        threads.push(row);
        return row;
      },
      findMany: async (_args: any) => threads,
    },
    run: {
      create: async ({ data }: any) => {
        const row = { id: `r-${idSeq++}`, threadId: data.threadId, status: data.status ?? 'running', createdAt: new Date(), updatedAt: new Date() };
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
        const row = { id: `m-${idSeq++}`, kind: data.kind, text: data.text ?? null, source: data.source, createdAt: new Date() };
        messages.push(row);
        return row;
      },
      findMany: async ({ where: { id: { in: ids } } }: any) => messages.filter((m) => ids.includes(m.id)),
    },
    runMessage: {
      create: async ({ data }: any) => {
        const row = { runId: data.runId, messageId: data.messageId, type: data.type, createdAt: new Date() };
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

