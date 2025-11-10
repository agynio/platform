import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostgresMemoryRepository } from '../src/graph/nodes/memory.repository';
import { MemoryService } from '../src/graph/nodes/memory.service';

// Integration test against Postgres (requires AGENTS_DATABASE_URL env)
const URL = process.env.AGENTS_DATABASE_URL;

// Skip tests if no Postgres URL provided
const maybeDescribe = URL ? describe : describe.skip;

maybeDescribe('PostgresMemoryRepository adapter', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  let svc: MemoryService;

  beforeAll(async () => {
    svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    await svc.ensureIndexes();
    await prisma.$executeRaw`DELETE FROM memories`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create, append, read, update, delete', async () => {
    const bound = svc.forMemory('nodeA', 'global');
    expect(await bound.stat('/')).toEqual({ kind: 'dir' });
    await bound.ensureDir('/docs');
    await bound.append('/docs/readme.txt', 'hello');
    await bound.append('/docs/readme.txt', 'world');
    const content = await bound.read('/docs/readme.txt');
    expect(content).toContain('hello');
    expect(content).toContain('world');
    const replaced = await bound.update('/docs/readme.txt', 'world', 'WORLD');
    expect(replaced).toBe(1);
    expect(await bound.read('/docs/readme.txt')).toContain('WORLD');
    const del = await bound.delete('/docs');
    expect(del.dirs).toBeGreaterThanOrEqual(1);
  });
});
