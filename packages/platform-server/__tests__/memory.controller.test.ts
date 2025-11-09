import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MemoryController } from '../src/graph/controllers/memory.controller';
import { ModuleRef } from '@nestjs/core';
import { MemoryService } from '../src/graph/nodes/memory.repository';

const URL = process.env.AGENTS_DATABASE_URL;
const maybeDescribe = URL ? describe : describe.skip;

class StubModuleRef implements Partial<ModuleRef> {
  constructor(private prisma: PrismaClient) {}
  get<T>(_token: any): T {
    return new MemoryService({ getClient: () => this.prisma } as any) as unknown as T;
  }
}

maybeDescribe('MemoryController endpoints', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS memories`);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('append/read via controller', async () => {
    const controller = new MemoryController(new StubModuleRef(prisma) as any, { getClient: () => prisma } as any);
    await controller.append({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt', data: 'hi' });
    await controller.append({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt', data: 'there' });
    const read = await controller.read({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt' } as any);
    expect(read.content).toContain('hi');
    const stat = await controller.stat({ nodeId: 'nodeC', scope: 'global' } as any, { path: '/greet.txt' } as any);
    expect(stat.kind).toBe('file');
  });
});

