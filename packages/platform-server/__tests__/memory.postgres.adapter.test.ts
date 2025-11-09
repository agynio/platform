import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MemoryService } from '../src/graph/nodes/memory.repository';

// Integration test against Postgres (requires AGENTS_DATABASE_URL env)
const URL = process.env.AGENTS_DATABASE_URL;

// Skip tests if no Postgres URL provided
const maybeDescribe = URL ? describe : describe.skip;

maybeDescribe('PostgresMemoryRepository adapter', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS memories`);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create, append, read, update, delete', async () => {
    const svc = new MemoryService({ getClient: () => prisma } as any).init({ nodeId: 'nodeA', scope: 'global' });
    await svc.ensureIndexes();
    expect(await svc.stat('/')).toEqual({ kind: 'dir' });
    await svc.ensureDir('/docs');
    await svc.append('/docs/readme.txt', 'hello');
    await svc.append('/docs/readme.txt', 'world');
    const content = await svc.read('/docs/readme.txt');
    expect(content).toContain('hello');
    expect(content).toContain('world');
    const replaced = await svc.update('/docs/readme.txt', 'world', 'WORLD');
    expect(replaced).toBe(1);
    expect(await svc.read('/docs/readme.txt')).toContain('WORLD');
    const del = await svc.delete('/docs');
    expect(del.dirs).toBeGreaterThanOrEqual(1);
  });
});

