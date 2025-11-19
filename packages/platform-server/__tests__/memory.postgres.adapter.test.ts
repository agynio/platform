import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PostgresMemoryRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';

// Integration test against Postgres (requires AGENTS_DATABASE_URL env)
const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;

// Skip tests if no Postgres URL provided or DB tests disabled
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

maybeDescribe('PostgresMemoryRepository adapter', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  let svc: MemoryService;

  beforeAll(async () => {
    svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    await prisma.$executeRaw`DELETE FROM memories WHERE node_id IN (${Prisma.join(['nodeA'])})`;
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
