import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PostgresMemoryEntitiesRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../src/nodes/tools/memory/memory.tool';
import { Logger } from '@nestjs/common';

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

maybeDescribe('Memory tool adapters', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  beforeAll(async () => {
    const svc = new MemoryService(
      new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any),
      { get: async () => null } as any,
    );
    svc.forMemory('bootstrap', 'global');
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(['bootstrap', 'nodeX'])})`;
  });
  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(['nodeX'])})`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('wrap LangChain tools and operate on MemoryService via config.thread_id', async () => {
    const db = { getClient: () => prisma } as any;
    const serviceFactory = (opts: { threadId?: string }) => {
      const svc = new MemoryService(new PostgresMemoryEntitiesRepository(db as any), { get: async () => null } as any);
      return svc.forMemory('nodeX', opts.threadId ? 'perThread' : 'global', opts.threadId) as any;
    };
    const logger = new Logger('MemoryToolAdaptersTest');
    const adapter = new UnifiedMemoryTool({ getDescription: () => '', getName: () => 'memory', getMemoryFactory: () => serviceFactory, logger });
    const name = adapter.name;
    expect(name).toBe('memory');

    const config = { configurable: { thread_id: 'T1' } } as any;
    const unified = adapter;
    await unified.execute({ path: '/a/x', command: 'append', content: 'one' } as any, { threadId: 'T1' } as any);

    const readRes = JSON.parse(await unified.execute({ path: '/a/x', command: 'read' } as any, { threadId: 'T1' } as any) as any);
    expect(readRes.ok).toBe(true);
    expect(readRes.result.content).toBe('one');

    const upd = JSON.parse(await unified.execute({ path: '/a/x', command: 'update', oldContent: 'one', content: 'two' } as any, { threadId: 'T1' } as any) as any);
    expect(upd.result.replaced).toBe(1);

    const listRes = JSON.parse(await unified.execute({ path: '/', command: 'list' } as any, { threadId: 'T1' } as any) as any);
    expect(Array.isArray(listRes.result.entries)).toBe(true);

    const delRes = JSON.parse(await unified.execute({ path: '/a', command: 'delete' } as any, { threadId: 'T1' } as any) as any);
    expect(delRes.result.removed).toBeGreaterThanOrEqual(1);
  });

  it('negative cases: ENOENT, EINVAL, ENOTMEM, list empty path', async () => {
    const db = { getClient: () => prisma } as any;
    const serviceFactory = (opts: { threadId?: string }) => {
      const svc = new MemoryService(new PostgresMemoryEntitiesRepository(db as any), { get: async () => null } as any);
      return svc.forMemory('nodeX', opts.threadId ? 'perThread' : 'global', opts.threadId) as any;
    };
    const logger = new Logger('MemoryToolAdaptersTest');

    // ENOTMEM: do not wire memory
    const unconnected = new UnifiedMemoryTool({ getDescription: () => '', getName: () => 'memory', getMemoryFactory: () => undefined, logger });
    const enotmem = JSON.parse((await unconnected.execute({ path: '/x', command: 'read' } as any)) as any);
    expect(enotmem.ok).toBe(false);
    expect(enotmem.error.code).toBe('ENOTMEM');

    // Properly wired instance
    const wired = new UnifiedMemoryTool({ getDescription: () => '', getName: () => 'memory', getMemoryFactory: () => serviceFactory, logger }); const tool = wired;

    // ENOENT on read
    const enoentRead = JSON.parse((await tool.execute({ path: '/missing', command: 'read' } as any)) as any);
    expect(enoentRead.ok).toBe(false);
    expect(enoentRead.error.code).toBe('ENOENT');

    // ENOENT on update when file does not exist
    const enoentUpdate = JSON.parse((await tool.execute({ path: '/missing', command: 'update', oldContent: 'x', content: 'y' } as any)) as any);
    expect(enoentUpdate.ok).toBe(false);
    expect(enoentUpdate.error.code).toBe('ENOENT');

    // Prepare a doc
    await tool.execute({ path: 'dir/file', command: 'append', content: 'v' } as any);

    // EINVAL: missing content/oldContent and unknown command
    const einvalAppend = JSON.parse((await tool.execute({ path: '/dir/file', command: 'append' } as any)) as any);
    expect(einvalAppend.ok).toBe(false);
    expect(einvalAppend.error.code).toBe('EINVAL');
    const einvalUpdate = JSON.parse((await tool.execute({ path: '/dir/file', command: 'update', oldContent: 'x' } as any)) as any);
    expect(einvalUpdate.ok).toBe(false);
    expect(einvalUpdate.error.code).toBe('EINVAL');
    const unknownCmd = JSON.parse((await tool.execute({ path: '/dir/file', command: 'unknown' } as any)) as any);
    expect(unknownCmd.ok).toBe(false);
    expect(unknownCmd.error.code).toBe('EINVAL');

    // list with empty path
    const listRoot = JSON.parse((await tool.execute({ path: '', command: 'list' } as any)) as any);
    expect(listRoot.ok).toBe(true);
    expect(Array.isArray(listRoot.result.entries)).toBe(true);
  });
});
