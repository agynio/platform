import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { MemoryController } from '../src/graph/controllers/memory.controller';
import { ModuleRef } from '@nestjs/core';
import { PostgresMemoryRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';
import { HttpException } from '@nestjs/common';

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

class StubModuleRef implements Partial<ModuleRef> {
  constructor(private prisma: PrismaClient) {}
  get<T>(_token: any): T {
    return new MemoryService(new PostgresMemoryRepository({ getClient: () => this.prisma } as any)) as unknown as T;
  }
}

maybeDescribe('MemoryController endpoints', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });

  beforeAll(async () => {
    const svc = new MemoryService(new PostgresMemoryRepository({ getClient: () => prisma } as any));
    svc.forMemory('bootstrap', 'global');
    await prisma.$executeRaw`DELETE FROM memories WHERE node_id IN (${Prisma.join(['bootstrap', 'nodeC', 'nodeT'])})`;
  });
  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM memories WHERE node_id IN (${Prisma.join(['nodeC', 'nodeT'])})`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('append/read via controller', async () => {
    const controller = new MemoryController(new StubModuleRef(prisma) as any, { getClient: () => prisma } as any);
    await controller.append({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt', data: 'hi' } as any, {} as any);
    await controller.append({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt', data: 'there' } as any, {} as any);
    const read = await controller.read({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt' } as any);
    expect(read.content).toContain('hi');
    const stat = await controller.stat({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt' } as any);
    expect(stat.kind).toBe('file');
  });

  it('enforces thread scoping for per-thread routes', async () => {
    const controller = new MemoryController(new StubModuleRef(prisma) as any, { getClient: () => prisma } as any);

    let caught: unknown;
    try {
      await controller.append({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/note.txt', data: 'hello' } as any, {} as any);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(400);

    await controller.ensureDir({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/logs' } as any, { threadId: 'thread-1' } as any);
    await controller.append(
      { nodeId: 'nodeT', scope: 'perThread' } as any,
      { path: '/logs/day.txt', data: 'first', threadId: 'thread-1' } as any,
      {} as any,
    );

    const updateResult = await controller.update(
      { nodeId: 'nodeT', scope: 'perThread' } as any,
      { path: '/logs/day.txt', oldStr: 'first', newStr: 'second' } as any,
      { threadId: 'thread-1' } as any,
    );
    expect(updateResult.replaced).toBe(1);

    const rootList = await controller.list({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/', threadId: 'thread-1' } as any);
    expect(rootList.items).toEqual(expect.arrayContaining([{ name: 'logs', kind: 'dir' }]));

    const nestedList = await controller.list({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/logs', threadId: 'thread-1' } as any);
    expect(nestedList.items).toEqual(expect.arrayContaining([{ name: 'day.txt', kind: 'file' }]));

    const read = await controller.read({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/logs/day.txt', threadId: 'thread-1' } as any);
    expect(read.content.trim()).toBe('second');

    const dump = await controller.dump({ nodeId: 'nodeT', scope: 'perThread' } as any, { threadId: 'thread-1' } as any);
    expect((dump as any).data['logs.day.txt']).toBe('second');
    expect((dump as any).dirs['logs']).toBe(true);

    const deletion = await controller.remove({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/logs/day.txt', threadId: 'thread-1' } as any);
    expect(deletion.files).toBe(1);

    const postStat = await controller.stat({ nodeId: 'nodeT', scope: 'perThread' } as any, { path: '/logs/day.txt', threadId: 'thread-1' } as any);
    expect(postStat.kind).toBe('none');

    const dumpAfter = await controller.dump({ nodeId: 'nodeT', scope: 'perThread' } as any, { threadId: 'thread-1' } as any);
    expect(Object.keys((dumpAfter as any).data)).toHaveLength(0);
  });
});
