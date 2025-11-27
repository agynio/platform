import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PostgresMemoryEntitiesRepository } from '../../src/nodes/memory/memory.repository';
import { MemoryService } from '../../src/nodes/memory/memory.service';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../../src/nodes/tools/memory/memory.tool';
import { MemoryToolNode } from '../../src/nodes/tools/memory/memory.node';
import { randomUUID } from 'node:crypto';

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe.sequential : describe.skip;
const NODE_ID = `nodeT-${randomUUID()}`;


maybeDescribe('memory_append tool: path normalization and validation', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  beforeAll(async () => {
    const svc = new MemoryService(
      new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any),
      { get: async () => null } as any,
    );
    svc.forMemory('bootstrap', 'global');
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join([NODE_ID, 'bootstrap'])})`;
  });
  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join([NODE_ID])})`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  const mkTools = () => {
    const db = { getClient: () => prisma } as any;
    const factory = (opts: { threadId?: string }) => {
      const svc = new MemoryService(new PostgresMemoryEntitiesRepository(db as any), { get: async () => null } as any);
      return svc.forMemory(NODE_ID, opts.threadId ? 'perThread' : 'global', opts.threadId) as any;
    };
    const node = new MemoryToolNode();
    node.setMemorySource(factory);
    const tool = node.getTool();
    return { unified: tool };
  };

  it('Case A: path without leading slash is normalized and succeeds', async () => {
    const { unified } = mkTools();
    await unified.execute({ path: 'U08ES6U5SSF', command: 'append', content: '{"user":"v"}' } as any);
    const content = JSON.parse(await unified.execute({ path: '/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(typeof content.result.content).toBe('string');
    expect(String(content.result.content)).toContain('user');
  });

  it('Case B: path with leading slash works as control', async () => {
    const { unified } = mkTools();
    await unified.execute({ path: '/U08ES6U5SSF', command: 'append', content: 'hello' } as any);
    const content = JSON.parse(await unified.execute({ path: '/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(content.result.content).toBe('hello');
  });

  it('Case C: invalid characters in path trigger validation error', async () => {
    const { unified } = mkTools();
    const res1 = JSON.parse((await unified.execute({ path: '../hack', command: 'append', content: 'x' } as any)) as any);
    expect(res1.ok).toBe(false);
    expect(res1.error.code).toBe('EINVAL');
    const res2 = JSON.parse((await unified.execute({ path: '/bad$eg', command: 'append', content: 'x' } as any)) as any);
    expect(res2.ok).toBe(false);
    expect(res2.error.code).toBe('EINVAL');
  });

  it('Case D: append to new then existing file succeeds', async () => {
    const { unified } = mkTools();
    await unified.execute({ path: '/file', command: 'append', content: 'one' } as any);
    await unified.execute({ path: '/file', command: 'append', content: 'two' } as any);
    const content = JSON.parse(await unified.execute({ path: '/file', command: 'read' } as any) as any);
    expect(content.result.content).toBe('one\ntwo');
  });

  it('Case E: nested path without leading slash is normalized and parent dirs ensured', async () => {
    const { unified } = mkTools();
    await unified.execute({ path: 'users/U08ES6U5SSF', command: 'append', content: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' } as any);
    const content = JSON.parse(await unified.execute({ path: '/users/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(String(content.result.content)).toContain('Vitalii');
  });

  it('Case F: nested path with leading slash works identically', async () => {
    const { unified } = mkTools();
    await unified.execute({ path: '/users/U08ES6U5SSF', command: 'append', content: '{"user_id":"U08ES6U5SSF","name":"Vitalii"}\n' } as any);
    const content = JSON.parse(await unified.execute({ path: '/users/U08ES6U5SSF', command: 'read' } as any) as any);
    expect(String(content.result.content)).toContain('U08ES6U5SSF');
  });
});
