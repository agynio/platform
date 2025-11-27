import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PostgresMemoryEntitiesRepository } from '../../src/nodes/memory/memory.repository';
import { MemoryService } from '../../src/nodes/memory/memory.service';
import { MemoryToolNode } from '../../src/nodes/tools/memory/memory.node';

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

maybeDescribe('E2E: memory tools with Postgres backend', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  let svc: MemoryService;

  beforeAll(async () => {
    svc = new MemoryService(
      new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any),
      { get: async () => null } as any,
    );
    const bootstrap = svc.forMemory('bootstrap', 'global');
  });

  const nodeIds = ['node-append-1', 'node-append-2', 'node-lrud-1', 'node-lrud-2'];

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(nodeIds)})`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeTool(nodeId: string) {
    const node = new MemoryToolNode();
    node.setMemorySource((opts: { threadId?: string }) => svc.forMemory(nodeId, opts.threadId ? 'perThread' : 'global', opts.threadId) as any);
    return node.getTool();
  }

  describe('append', () => {
    it('stores data for new path', async () => {
      const unified = makeTool('node-append-1');

      const appendRes = JSON.parse(
        (await unified.execute({ path: 'user/1', command: 'append', content: '{"username":"Test"}' } as any)) as any,
      );
      expect(appendRes.ok).toBe(true);

      const content = JSON.parse((await unified.execute({ path: 'user/1', command: 'read' } as any)) as any);
      expect(content.ok).toBe(true);
      expect(String(content.result.content)).toContain('"username":"Test"');
    });

    it('appends without overwriting existing data', async () => {
      const unified = makeTool('node-append-2');

      await unified.execute({ path: 'user/2', command: 'append', content: '{"username":"Test"}' } as any);
      await unified.execute({ path: 'user/2', command: 'append', content: '{"interests":"Sub1,Sub2"}' } as any);

      const content = JSON.parse((await unified.execute({ path: 'user/2', command: 'read' } as any)) as any);
      expect(typeof content.result.content).toBe('string');
      expect(String(content.result.content)).toContain('"username":"Test"');
      expect(String(content.result.content)).toContain('"interests":"Sub1,Sub2"');
    });
  });

  describe('list/read/update/delete', () => {
    it('lists directory entries after multiple appends', async () => {
      const unified = makeTool('node-lrud-1');

      await unified.execute({ path: 'projects/p1', command: 'append', content: '{"name":"Alpha"}' } as any);
      await unified.execute({ path: 'projects/p2', command: 'append', content: '{"name":"Beta"}' } as any);

      const listingRaw = JSON.parse((await unified.execute({ path: 'projects', command: 'list' } as any)) as any);
      expect(typeof listingRaw).toBe('object');
      const names = listingRaw.result.entries.map((i: any) => i.name).sort();
      expect(names).toEqual(['p1', 'p2']);
    });

    it('reads, updates occurrences, and then deletes a file', async () => {
      const unified = makeTool('node-lrud-2');
      const targetPath = 'notes/today';

      await unified.execute({ path: targetPath, command: 'append', content: 'Weather is sunny. Mood: good.' } as any);
      let content = JSON.parse((await unified.execute({ path: targetPath, command: 'read' } as any)) as any);
      expect(String(content.result.content)).toContain('sunny');

      const updateCount = JSON.parse(
        (await unified.execute({ path: targetPath, command: 'update', oldContent: 'sunny', content: 'rainy' } as any)) as any,
      );
      expect(Number(updateCount.result.replaced)).toBeGreaterThanOrEqual(1);

      content = JSON.parse((await unified.execute({ path: targetPath, command: 'read' } as any)) as any);
      expect(String(content.result.content)).toContain('rainy');
      expect(String(content.result.content)).not.toContain('sunny');

      const delResultRaw = JSON.parse((await unified.execute({ path: targetPath, command: 'delete' } as any)) as any);
      expect(typeof delResultRaw).toBe('object');
      expect(delResultRaw.result.removed).toBeGreaterThanOrEqual(1);

      const listingRaw = JSON.parse((await unified.execute({ path: 'notes', command: 'list' } as any)) as any);
      const names = listingRaw.result.entries.map((i: any) => i.name);
      expect(names).not.toContain('today');
    });
  });
});
