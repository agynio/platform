import { PrismaClient, Prisma } from '@prisma/client';
import { PostgresMemoryRepository } from '../src/graph/nodes/memory.repository';
import { MemoryService } from '../src/graph/nodes/memory.service';

const URL = process.env.AGENTS_DATABASE_URL;
const maybeDescribe = URL ? describe : describe.skip;

maybeDescribe('MemoryService', () => {
  if (!URL) return;
  it("normalizes paths and forbids .. and $", async () => {
    const repo = new PostgresMemoryRepository({ getClient: () => new PrismaClient({ datasources: { db: { url: URL! } } }) } as any);
    const svc = new MemoryService(repo);
    expect(svc.normalizePath('a/b')).toBe('/a/b');
    expect(svc.normalizePath('/a//b/')).toBe('/a/b');
    expect(svc.normalizePath('greet.txt')).toBe('/greet.txt');
    expect(() => svc.normalizePath('../x')).toThrow();
    expect(() => svc.normalizePath('/a/$b')).toThrow();
  });

  it('append/read/update/delete with string-only semantics', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
    const svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    const nodeId = 'memory-service-n1';
    await prisma.$executeRaw`DELETE FROM memories WHERE node_id IN (${Prisma.join([nodeId])})`;

    const bound = svc.forMemory(nodeId, 'global');
    await bound.append('/notes/today', 'hello');
    expect(await bound.read('/notes/today')).toBe('hello');

    await bound.append('/notes/today', 'world');
    expect(await bound.read('/notes/today')).toBe('hello\nworld');

    const count = await bound.update('/notes/today', 'world', 'there');
    expect(count).toBe(1);
    expect(await bound.read('/notes/today')).toBe('hello\nthere');

    const statFile = await bound.stat('/notes/today');
    expect(statFile.kind).toBe('file');

    const listRoot = await bound.list('/');
    expect(listRoot.find((e) => e.name === 'notes')?.kind).toBe('dir');

    const delRes = await bound.delete('/notes');
    expect(delRes.files).toBe(1);
    expect((await bound.stat('/notes')).kind).toBe('none');
  });

  it('perThread and global scoping', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
    const svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    const nodeId = 'memory-service-scope';
    await prisma.$executeRaw`DELETE FROM memories WHERE node_id IN (${Prisma.join([nodeId])})`;
    const g = svc.forMemory(nodeId, 'global');
    const t1 = svc.forMemory(nodeId, 'perThread', 't1');
    const t2 = svc.forMemory(nodeId, 'perThread', 't2');

    await g.append('/x', 'G');
    await t1.append('/x', 'T1');
    await t2.append('/x', 'T2');

    expect(await g.read('/x')).toBe('G');
    expect(await t1.read('/x')).toBe('T1');
    expect(await t2.read('/x')).toBe('T2');
  });
});
