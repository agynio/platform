import { PrismaClient } from '@prisma/client';
import { PostgresMemoryRepository } from '../src/graph/nodes/memory.repository';
import { MemoryService } from '../src/graph/nodes/memory.service';

const URL = process.env.AGENTS_DATABASE_URL;
const maybeDescribe = URL ? describe : describe.skip;

maybeDescribe('MemoryService', () => {
  it("normalizes paths and forbids .. and $", async () => {
    const repo = new PostgresMemoryRepository({ getClient: () => new PrismaClient({ datasources: { db: { url: URL! } } }) } as any);
    const svc = new MemoryService(repo);
    svc.init({ nodeId: 'n1', scope: 'global' });
    expect(svc.normalizePath('a/b')).toBe('/a/b');
    expect(svc.normalizePath('/a//b/')).toBe('/a/b');
    expect(svc.normalizePath('greet.txt')).toBe('/greet.txt');
    expect(() => svc.normalizePath('../x')).toThrow();
    expect(() => svc.normalizePath('/a/$b')).toThrow();
  });

  it('append/read/update/delete with string-only semantics', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
    const svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    svc.init({ nodeId: 'n1', scope: 'global' });
    await svc.ensureIndexes();
    await prisma.$executeRaw`DELETE FROM memories`;

    await svc.append('/notes/today', 'hello');
    expect(await svc.read('/notes/today')).toBe('hello');

    await svc.append('/notes/today', 'world');
    expect(await svc.read('/notes/today')).toBe('hello\nworld');

    const count = await svc.update('/notes/today', 'world', 'there');
    expect(count).toBe(1);
    expect(await svc.read('/notes/today')).toBe('hello\nthere');

    const statFile = await svc.stat('/notes/today');
    expect(statFile.kind).toBe('file');

    const listRoot = await svc.list('/');
    expect(listRoot.find((e) => e.name === 'notes')?.kind).toBe('dir');

    const delRes = await svc.delete('/notes');
    expect(delRes.files).toBe(1);
    expect((await svc.stat('/notes')).kind).toBe('none');
  });

  it('perThread and global scoping', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
    const bootstrap = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any)).init({ nodeId: 'bootstrap', scope: 'global' });
    await bootstrap.ensureIndexes();
    await prisma.$executeRaw`DELETE FROM memories`;
    const g = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any)); g.init({ nodeId: 'nodeA', scope: 'global' });
    const t1 = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any)); t1.init({ nodeId: 'nodeA', scope: 'perThread', threadId: 't1' });
    const t2 = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any)); t2.init({ nodeId: 'nodeA', scope: 'perThread', threadId: 't2' });

    await g.append('/x', 'G');
    await t1.append('/x', 'T1');
    await t2.append('/x', 'T2');

    expect(await g.read('/x')).toBe('G');
    expect(await t1.read('/x')).toBe('T1');
    expect(await t2.read('/x')).toBe('T2');
  });
});
